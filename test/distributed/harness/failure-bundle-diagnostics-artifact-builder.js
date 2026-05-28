import * as foundation from './failure-bundle-diagnostics-foundation.js';
import * as diagnostics from './failure-bundle-diagnostics-merge.js';
import * as priority from './failure-bundle-diagnostics-priority-recovery.js';
import {FAILURE_BUNDLE_EMPTY_BLOCKED_NODE_IDS, FAILURE_BUNDLE_NO_ARTIFACT, FAILURE_BUNDLE_NO_PUBLICATION_CONVERGENCE_SUMMARY, FAILURE_BUNDLE_NO_PUBLICATION_MEMBERSHIP_NODE_IDS, resolveSqlFields as sqlFields} from './failure-bundle-sql-query-engine-availability-fields.js';
const {ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD, ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG, ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT, CONTROL_PLANE_PRIORITY_RECOVERY_REASON, CONTROL_PLANE_PUBLICATION_STATUS, CONTROL_PLANE_QUIESCENCE_DISCOVERY_REASON_SET, CONTROL_PLANE_QUIESCENCE_REASON, CONTROL_PLANE_QUIESCENCE_STATE, CONTROL_PLANE_QUIESCENCE_TOPOLOGY_REASON_SET, CONTROL_PLANE_READINESS_REASON, EDGE_ID, EDGE_STATE, EMPTY_STRING, FAILURE_ARTIFACT_ACTIVE_GATE_READY_BLOCKER, FAILURE_ARTIFACT_OWNER_CONTRACT_ACTIONABLE_STATES, FAILURE_ARTIFACT_OWNER_CONTRACT_EMPTY_SUMMARY, FAILURE_ARTIFACT_PUBLICATION_GATE_BLOCKER_PREFIX, FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX, FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_BLOCKER_PREFIX, FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_SEPARATOR, FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET, FAILURE_BARRIER_ERROR_PREFIX_CONVERGENCE_TIMEOUT, FAILURE_BARRIER_ERROR_PREFIX_RESTART_RECOVERY_TIMEOUT, FAILURE_BARRIER_PHASE_CONVERGENCE, FAILURE_BARRIER_PHASE_RESTART_RECOVERY, FAILURE_BARRIER_REASON_CONVERGENCE_TIMEOUT, FAILURE_BARRIER_REASON_COUNT, FAILURE_BARRIER_REASON_RESTART_RECOVERY_TIMEOUT, FAILURE_BARRIER_SUPERSEDED_REASON_FRAGMENT_SET, FAILURE_BARRIER_SUPERSEDED_ROOT_CAUSE_CLASS_SET, FAILURE_BUNDLE_SEGMENT_3, FINAL_CONSISTENCY_CACHE_REASON_SET, FINAL_CONSISTENCY_CACHE_STATE_SET, FINAL_CONSISTENCY_CDC_REASON_SET, FINAL_CONSISTENCY_CDC_STATE_SET, FINAL_CONSISTENCY_LEADER_MISMATCH_MESSAGE_PREFIX, FINAL_CONSISTENCY_REASON_CDC_VISIBILITY_LAG, FINAL_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE, FINAL_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG, FINAL_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG, FINAL_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED, FINAL_CONSISTENCY_REASON_TRANSPORT_DELIVERY_DEFERRED, FINAL_CONSISTENCY_REASON_UNCLASSIFIED, FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED, FINAL_CONSISTENCY_STATE_CDC_VISIBILITY_LAG, FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH, FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG, FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG, FINAL_CONSISTENCY_STATE_TRANSPORT_DELIVERY_DEFERRED, FINAL_CONSISTENCY_TOPOLOGY_REASON_SET, FINAL_CONSISTENCY_TOPOLOGY_STATE_SET, JS_OBJECT_TYPE, LOAD_WAIT_REASON_ATTEMPT_ERRORS, LOAD_WAIT_REASON_HARD_LOAD_FAILURES, ONE, PRIORITY_RECOVERY_ACTUATION_STATE, PRIORITY_RECOVERY_BLOCKER_REASON, PRIORITY_RECOVERY_BLOCKING_BOUNDARY, PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE, PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION, PRIORITY_RECOVERY_PROGRESS_OWNER, PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD, PRIORITY_RECOVERY_SEMANTIC_STATE, PRIORITY_RECOVERY_WITNESS_FRESHNESS_KEY_SEPARATOR, PRIORITY_RECOVERY_WORKFLOW_PROGRESS_ACTUATION_STATES, PUBLICATION_MISSING_PUBLISHED_ACTIVE_GATE_SELECTION_STATE, PUBLICATION_MISSING_PUBLISHED_EVIDENCE_RULES, PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE, PUBLICATION_OWNER_ACK_STATE, PUBLICATION_OWNER_FRESHNESS_FENCE, PUBLICATION_OWNER_RECOVERY_OUTCOME, PUBLICATION_OWNER_STREAM_OUTCOME, PUBLICATION_OWNER_TEXT, PUBLICATION_RECOVERY_GATE_STATE, PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE, READINESS_DIMENSION_CONTROL_PLANE_RECOVERY_ELIGIBLE, READINESS_DIMENSION_REPAIR_ELIGIBLE, READINESS_REASON_CONTROL_PLANE_PUBLICATION_PENDING, READINESS_REASON_CONTROL_PLANE_WRITE_UNHEALTHY, READINESS_REASON_PUBLISHED_CONVERGENCE_PENDING, READINESS_REASON_RECOVERY_ELIGIBILITY_PENDING, REASON, RECOVERY_PROTOCOL_STATE, RESTART_RECOVERY_READINESS_ADMIN_REFUSED_FRAGMENT, RESTART_RECOVERY_READINESS_BOOLEAN_FALSE, RESTART_RECOVERY_READINESS_BOOLEAN_TRUE, RESTART_RECOVERY_READINESS_FIELD, RESTART_RECOVERY_READINESS_FIELD_SEPARATOR, RESTART_RECOVERY_READINESS_FIELD_VALUE_SEPARATOR, RESTART_RECOVERY_READINESS_NODE_MARKER, RESTART_RECOVERY_READINESS_NO_VALUE, RESTART_RECOVERY_READINESS_OBSERVATION_END_MARKER, RESTART_RECOVERY_READINESS_OBSERVATION_START_MARKER, RESTART_RECOVERY_READINESS_REACHABLE_BY_BOOTSTRAP_HEALTH, RESTART_RECOVERY_READINESS_UNKNOWN_VALUE, addOwnerContractReasonCounts, attachCanonicalPublicationEvidence, buildActiveGatePriorityRecoveryActuationEvidence, buildCanonicalControlPlaneDiagnosticsFromControlPlane, buildCanonicalPublicationEvidenceFromControlPlane, buildFailureArtifactOwnerContractPresentation, buildFocusedNodeDiagnostics, buildPriorityRecoveryActuationWitnessEvidence, buildPriorityRecoveryProgressSummary, buildPriorityRecoveryWitnessFreshnessKey, buildPublicationRecoveryGateSnapshot, buildTopologyConvergenceGraphFromArtifacts, buildTopologyConvergenceOwnerPresentation, classifyActiveGateClosureWitness, collectPublicationMissingActiveNodeReasonCandidates, dedupePriorityRecoveryObservationWitnesses, filterReasonCountsForClosedPublication, filterReasonCountsForPublicationMissingActiveNode, hasActionableOwnerContractWitness, hasActiveGatePriorityRecoveryActuationEvidence, hasActiveGateSnapshotCoveragePending, hasActivePrioritySpreadGate, hasClosedPostActiveConvergenceOwners, hasClosedPublicationConvergenceEvidence, hasCompletePriorityRecoveryOperationEvidence, hasConvergenceTimeoutError, hasOpenPublicationOrPriorityRecoveryBlocker, hasPriorityRecoveryOperationDetail, hasPrioritySpreadReasonCode, hasPublicationMissingActiveNodeBlocker, hasReadyActiveGatePublicationConvergence, hasRestartRecoveryPrioritySpreadEvidence, hasRestartRecoveryTimeoutError, hasSatisfiedPrioritySpreadEvidence, isPendingAckOwnerContractWitness, isPrioritySpreadSummarySatisfied, isPublicationMissingActiveNodeReason, isRestartRecoveryAdminReachabilityRefused, isSupersededFailureBarrierReason, isSupersededFailureBarrierRootCause, mapFirstFaultMarkerToReason, mergeControlPlaneDiagnostics, mergeControlSnapshotByNodeId, mergePriorityRecoveryObservationSnapshots, mergeRetainedPriorityRecoveryObservation, normalizeActiveGateBlockerReason, normalizePriorityRecoveryActiveGateSnapshot, normalizePriorityRecoveryPartitionWitnessesForDiagnostics, normalizeRestartRecoveryReadinessFieldValue, normalizeRestartRecoveryReadinessNumber, parseRestartRecoveryReadinessFieldMap, priorityRecoveryPartitionMapHasEntries, resolveActiveGateDominantBlockerReason, resolveActiveGateSnapshotCoverageBlocker, resolveControlPlaneQuiescenceRootCauseClass, resolveConvergenceFailureBarrier, resolveDominantReasonFromFirstFaultTimeline, resolveDominantReasonOverride, resolveFailureBarrier, resolveFinalConsistencyFailure, resolveFinalConsistencyFailureFromMessage, resolveFinalConsistencyRootCauseClass, resolveFirstFaultTimeline, resolveFreshRetainedPriorityRecoveryObservationWitnesses, resolveOwnerContractDominantReason, resolveOwnerContractRootCauseClass, resolvePriorityRecoveryObservationCount, resolvePriorityRecoveryObservationList, resolvePriorityRecoveryObservationMap, resolvePriorityRecoveryObservationWitnesses, resolvePriorityRecoveryWitnessFreshnessAtMs, resolvePublicationBlockedDominantReason, resolvePublicationMissingActiveNodeReason, resolvePublicationMissingActiveNodeReasonNodeIds, resolveRestartRecoveryFailureBarrier, resolveRestartRecoveryFailureBarrierReason, resolveRestartRecoveryFailureBarrierRootCauseClass, resolveRestartRecoveryReadinessObservation, resolveRestartRecoveryReadinessOwnerState, resolveStructuredControlPlaneQuiescenceFailure, resolveStructuredFinalConsistencyFailure, shouldApplyConvergenceFailureBarrier, shouldMergeRetainedPriorityRecoveryObservation} = Object.assign({}, foundation, diagnostics, priority);
const {
  ROOT_CAUSE_CLASS_UNKNOWN,
  ZERO,
  addNormalizedReasonCount,
  buildDominantReason,
  buildPriorityRecoveryProgressDominantReason,
  deriveReasonCountsFromLoadMetrics,
  deriveReasonCountsFromPublicationConvergence,
  deriveReasonCountsFromReadiness,
  isRecord,
  mergeReasonCounts,
  normalizeActiveGateReadinessDelay,
  normalizeAffectedNodeIds,
  normalizeDistinctStringArray,
  normalizeNonNegativeCount,
  normalizePriorityPartitionSummary,
  orderPublicationConvergenceReasons,
  resolveFailureDiagnostics,
  resolveLoadMetrics,
  resolveRelevantNodeIds,
  resolveRootCauseClass,
} = foundation;
export function buildFailureArtifact({
  entry,
  readiness,
  controlPlane,
  firstFaultTimeline,
}) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const hasExistingFailure = isRecord(diagnostics.failure);
  const existingFailure = hasExistingFailure ? diagnostics.failure : {};
  const loadMetrics = resolveLoadMetrics(entry);
  const loadReasonCounts = deriveReasonCountsFromLoadMetrics(loadMetrics);
  const readinessReasonCounts = deriveReasonCountsFromReadiness(
    readiness?.nodeReasonsByNodeId,
  );
  const publicationConvergenceReasonCounts =
    deriveReasonCountsFromPublicationConvergence(controlPlane);
  const publicationConvergence = buildPublicationConvergenceSummary(controlPlane);
  const quiescenceFailure =
    resolveStructuredControlPlaneQuiescenceFailure(diagnostics);
  const failureBarrier = resolveFailureBarrier({
    entry,
    existingFailure,
    publicationConvergence,
  });
  const reasonCounts = filterReasonCountsForPublicationMissingActiveNode({
    reasonCounts: mergeReasonCounts(
      filterReasonCountsForClosedPublication({
        reasonCounts: existingFailure.reasonCounts,
        publicationConvergence,
      }),
      loadReasonCounts,
      readinessReasonCounts,
      publicationConvergenceReasonCounts,
      quiescenceFailure?.reasonCounts,
    ),
    publicationConvergence,
  });
  if (
    hasPrioritySpreadReasonCode(publicationConvergence?.priorityRecoveryReasonCodes)
  ) {
    delete reasonCounts[
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON
        .PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE
    ];
    if (
      !Object.hasOwn(
        reasonCounts,
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      )
    ) {
      addNormalizedReasonCount(
        reasonCounts,
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
        ONE,
      );
    }
  }
  if (failureBarrier?.dominantReason) {
    addNormalizedReasonCount(
      reasonCounts,
      failureBarrier.dominantReason,
      FAILURE_BARRIER_REASON_COUNT,
    );
  }
  const timelineDominantReason =
    resolveDominantReasonFromFirstFaultTimeline(firstFaultTimeline);
  const progressDominantReason = buildPriorityRecoveryProgressDominantReason(
    publicationConvergence?.priorityRecoveryProgressSummary,
  );
  const ownerContractPresentation =
    buildFailureArtifactOwnerContractPresentation({
      entry,
      existingFailure,
      publicationConvergence,
      reasonCounts,
      progressDominantReason,
    });
  addOwnerContractReasonCounts(reasonCounts, ownerContractPresentation);
  const ownerContractDominantReason =
    resolveOwnerContractDominantReason(ownerContractPresentation);
  const ownerContractRootCauseClass =
    resolveOwnerContractRootCauseClass(ownerContractPresentation);
  const finalConsistencyFailure = resolveFinalConsistencyFailure(
    entry,
    controlPlane,
  );
  const finalConsistencyReason =
    finalConsistencyFailure?.dominantReason || null;
  const quiescenceReason = quiescenceFailure?.dominantReason || null;
  const dominantReasonOverride = resolveDominantReasonOverride({
    existingDominantReason: existingFailure.dominantReason,
    publicationConvergence,
  });
  const dominantReason =
    finalConsistencyReason ||
    quiescenceReason ||
    ownerContractDominantReason ||
    dominantReasonOverride ||
    failureBarrier?.dominantReason ||
    (typeof existingFailure.dominantReason === 'string' &&
    existingFailure.dominantReason.length > ZERO ?
      existingFailure.dominantReason :
      progressDominantReason ||
        buildDominantReason(reasonCounts) ||
        timelineDominantReason ||
        null);
  if (dominantReason && !Object.hasOwn(reasonCounts, dominantReason)) {
    reasonCounts[dominantReason] = ONE;
  }
  const rootCauseClass = finalConsistencyFailure ?
    finalConsistencyFailure.rootCauseClass :
    quiescenceFailure ?
      quiescenceFailure.rootCauseClass :
      ownerContractRootCauseClass ?
        ownerContractRootCauseClass :
        failureBarrier?.rootCauseClass ?
          failureBarrier.rootCauseClass :
          resolveRootCauseClass({
            rootCauseClass: existingFailure.rootCauseClass,
            dominantReason,
            reasonCounts,
            loadMetrics,
            firstFaultTimeline,
            readiness,
            controlPlane,
          });
  const affectedNodeIds = normalizeAffectedNodeIds(
    entry,
    resolveRelevantNodeIds(entry),
  );
  if (
    !hasExistingFailure &&
    Object.keys(reasonCounts).length === ZERO &&
    !dominantReason &&
    affectedNodeIds.length === ZERO &&
    rootCauseClass === ROOT_CAUSE_CLASS_UNKNOWN
  ) {
    return FAILURE_BUNDLE_NO_ARTIFACT;
  }
  return {
    ...existingFailure,
    rootCauseClass,
    dominantReason,
    reasonCounts,
    affectedNodeIds,
    ...(ownerContractPresentation ?
      {ownerContract: ownerContractPresentation} :
      {}),
    ...(failureBarrier ? {failureBarrier} : {}),
    ...(quiescenceFailure ? {quiescence: quiescenceFailure.quiescence} : {}),
  };
}
export function resolvePublicationConvergenceRecoveryProtocolState({
  rawRecoveryProtocolState,
  activePrioritySpreadGate,
  publicationRecoveryOpen,
}) {
  if (
    rawRecoveryProtocolState === RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING &&
    activePrioritySpreadGate === true
  ) {
    return RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING;
  }
  if (
    rawRecoveryProtocolState === RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING &&
    publicationRecoveryOpen === true
  ) {
    return RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING;
  }
  if (
    rawRecoveryProtocolState === RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING &&
    activePrioritySpreadGate !== true
  ) {
    return RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED;
  }
  return rawRecoveryProtocolState || null;
}
export function hasPublishedPrioritySpreadRecoveryConvergence(evidence) {
  return evidence.publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
    evidence.pendingAckCount === ZERO &&
    evidence.blockedNodeCount === ZERO &&
    evidence.missingPublishedCount > ZERO &&
    evidence.canonicalMissingActiveNodeGateDebt !== true &&
    evidence.prioritySpreadPending === true;
}

export function hasClosedPublishedPublicationRecoveryGate(publicationRecoveryGate = null) {
  return isRecord(publicationRecoveryGate) &&
    publicationRecoveryGate.state ===
      PUBLICATION_RECOVERY_GATE_STATE.CONSUMER_LAG &&
    publicationRecoveryGate.publicationPending !== true &&
    publicationRecoveryGate.pendingAckCount === ZERO &&
    publicationRecoveryGate.publicationStatusNormalized ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
}

export function shouldUsePublicationRecoveryGatePendingAckCount({
  publicationRecoveryGate = null,
  pendingAckCount = ZERO,
  pendingAckNodeIds = [],
} = {}) {
  if (!isRecord(publicationRecoveryGate)) {
    return false;
  }
  const summaryPendingAckNodeIds =
    normalizeDistinctStringArray(pendingAckNodeIds);
  const gatePendingAckNodeIds =
    normalizeDistinctStringArray(publicationRecoveryGate.pendingAckNodeIds);
  return publicationRecoveryGate.publicationStatusNormalized ===
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN &&
    publicationRecoveryGate.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    publicationRecoveryGate.pendingAckCount === ZERO &&
    normalizeNonNegativeCount(pendingAckCount) > ZERO &&
    summaryPendingAckNodeIds.length === ZERO &&
    gatePendingAckNodeIds.length === ZERO &&
    publicationRecoveryGate.streamOutcome ===
      PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING &&
    publicationRecoveryGate.ackState ===
      PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE &&
    publicationRecoveryGate.freshnessFence ===
      PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING &&
    publicationRecoveryGate.recoveryOutcome ===
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION;
}

export function resolveActiveGateSelectedPublishedMembershipDeficitNodeIds(
  progress = null,
) {
  if (!isRecord(progress)) {
    return null;
  }
  const expectedNodeCount = normalizeNonNegativeCount(progress.expectedNodeCount);
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    progress.selectedPublishedActiveNodeIds,
  );
  const selectedPublishedActiveCount = Math.max(
    normalizeNonNegativeCount(progress.selectedPublishedActiveCount),
    selectedPublishedActiveNodeIds.length,
  );
  if (
    expectedNodeCount <= ZERO ||
    selectedPublishedActiveNodeIds.length === ZERO ||
    selectedPublishedActiveCount >= expectedNodeCount
  ) {
    return null;
  }
  const perNodePublicationDisagreementSet = isRecord(
    progress.perNodePublicationDisagreementSet,
  ) ?
    progress.perNodePublicationDisagreementSet :
    null;
  if (perNodePublicationDisagreementSet === null) {
    return null;
  }
  const expectedNodeIds = normalizeDistinctStringArray(
    Object.keys(perNodePublicationDisagreementSet),
  );
  if (expectedNodeIds.length <= selectedPublishedActiveNodeIds.length) {
    return null;
  }
  const selectedPublishedActiveNodeIdSet = new Set(selectedPublishedActiveNodeIds);
  const missingPublishedNodeIds = expectedNodeIds.filter((nodeId) =>
    selectedPublishedActiveNodeIdSet.has(nodeId) !== true,
  );
  return missingPublishedNodeIds.length > ZERO ? missingPublishedNodeIds : null;
}

export function resolveActiveGateSelectedMissingPublishedNodeIds(progress = null) {
  if (!isRecord(progress)) {
    return null;
  }
  const selectedPublishedMembershipDeficitNodeIds =
    resolveActiveGateSelectedPublishedMembershipDeficitNodeIds(progress);
  if (Array.isArray(progress.selectedMissingPublishedNodeIds)) {
    const selectedMissingPublishedNodeIds = normalizeDistinctStringArray(
      progress.selectedMissingPublishedNodeIds,
    );
    return selectedMissingPublishedNodeIds.length === ZERO &&
      selectedPublishedMembershipDeficitNodeIds !== null ?
      selectedPublishedMembershipDeficitNodeIds :
      selectedMissingPublishedNodeIds;
  }
  if (selectedPublishedMembershipDeficitNodeIds !== null) {
    return selectedPublishedMembershipDeficitNodeIds;
  }
  const expectedNodeCount = normalizeNonNegativeCount(progress.expectedNodeCount);
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    progress.selectedPublishedActiveNodeIds,
  );
  const selectedPublishedActiveCount = Math.max(
    normalizeNonNegativeCount(progress.selectedPublishedActiveCount),
    selectedPublishedActiveNodeIds.length,
  );
  return expectedNodeCount > ZERO &&
    selectedPublishedActiveCount === expectedNodeCount ?
    [] :
    null;
}

export function resolveAuthoritativePublicationMembershipNodeIds({
  publicationConvergence = null,
  publicationConvergenceGate = null,
  rawPublicationConvergence = null,
  rawPublicationConvergenceGate = null,
} = {}) {
  return normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(rawPublicationConvergenceGate?.requiredAckNodeIds),
    ...normalizeDistinctStringArray(rawPublicationConvergenceGate?.acknowledgedNodeIds),
    ...normalizeDistinctStringArray(rawPublicationConvergenceGate?.pendingAckNodeIds),
    ...normalizeDistinctStringArray(rawPublicationConvergenceGate?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergenceGate?.requiredAckNodeIds),
    ...normalizeDistinctStringArray(publicationConvergenceGate?.acknowledgedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergenceGate?.pendingAckNodeIds),
    ...normalizeDistinctStringArray(publicationConvergenceGate?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(rawPublicationConvergence?.requiredAckNodeIds),
    ...normalizeDistinctStringArray(rawPublicationConvergence?.acknowledgedNodeIds),
    ...normalizeDistinctStringArray(rawPublicationConvergence?.pendingAckNodeIds),
    ...normalizeDistinctStringArray(rawPublicationConvergence?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.requiredAckNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.acknowledgedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.pendingAckNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
    ),
    ...normalizeDistinctStringArray(publicationConvergence?.publishedActiveNodeIds),
  ]);
}

export function resolveRelevantPublicationMembershipNodeIds(
  nodeIds = null,
  authoritativePublicationMembershipNodeIds = [],
) {
  if (!Array.isArray(nodeIds)) {
    return FAILURE_BUNDLE_NO_PUBLICATION_MEMBERSHIP_NODE_IDS;
  }
  const authoritativeNodeIdSet = new Set(
    normalizeDistinctStringArray(authoritativePublicationMembershipNodeIds),
  );
  const normalizedNodeIds = normalizeDistinctStringArray(nodeIds);
  return authoritativeNodeIdSet.size > ZERO ?
    normalizeDistinctStringArray(
      normalizedNodeIds.filter((nodeId) => authoritativeNodeIdSet.has(nodeId)),
    ) :
    normalizedNodeIds;
}

export function hasStalePublicationClosureEvidence({
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
  rawPublicationConvergence = null,
  rawPublicationConvergenceGate = null,
} = {}) {
  const closureWitnessClasses = normalizeDistinctStringArray([
    publicationConvergence?.closureWitnessClass,
    publicationConvergenceGate?.closureWitnessClass,
    priorityRecoveryObservation?.closureWitnessClass,
    rawPublicationConvergence?.closureWitnessClass,
    rawPublicationConvergenceGate?.closureWitnessClass,
    publicationConvergence?.priorityRecoveryClosureWitness
      ?.closureWitnessClass,
    publicationConvergenceGate?.priorityRecoveryClosureWitness
      ?.closureWitnessClass,
    priorityRecoveryObservation?.priorityRecoveryClosureWitness
      ?.closureWitnessClass,
    rawPublicationConvergence?.priorityRecoveryClosureWitness
      ?.closureWitnessClass,
    rawPublicationConvergenceGate?.priorityRecoveryClosureWitness
      ?.closureWitnessClass,
  ]);
  const closureStates = normalizeDistinctStringArray([
    publicationConvergence?.priorityRecoveryClosureState,
    publicationConvergenceGate?.priorityRecoveryClosureState,
    priorityRecoveryObservation?.priorityRecoveryClosureState,
    rawPublicationConvergence?.priorityRecoveryClosureState,
    rawPublicationConvergenceGate?.priorityRecoveryClosureState,
    publicationConvergence?.priorityRecoveryClosureWitness?.state,
    publicationConvergenceGate?.priorityRecoveryClosureWitness?.state,
    priorityRecoveryObservation?.priorityRecoveryClosureWitness?.state,
    rawPublicationConvergence?.priorityRecoveryClosureWitness?.state,
    rawPublicationConvergenceGate?.priorityRecoveryClosureWitness?.state,
  ]);
  return (
    closureWitnessClasses.includes(
      ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
    ) ||
    closureStates.includes(
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION,
    )
  );
}

export function buildPublicationMissingPublishedEvidence({
  activeGateSnapshotCoveragePending = false,
  activeGatePriorityRecoveryActuationEvidenceOpen = false,
  hasExplicitPriorityRecoveryObservation = false,
  activeGateProgress = null,
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
  rawPublicationConvergence = null,
  rawPublicationConvergenceGate = null,
} = {}) {
  const authoritativePublicationMembershipNodeIds =
    resolveAuthoritativePublicationMembershipNodeIds({
      publicationConvergence,
      publicationConvergenceGate,
      rawPublicationConvergence,
      rawPublicationConvergenceGate,
    });
  const activeGateSelectedPublicationMembershipDeficitNodeIds =
    resolveRelevantPublicationMembershipNodeIds(
      resolveActiveGateSelectedPublishedMembershipDeficitNodeIds(
        activeGateProgress,
      ),
      authoritativePublicationMembershipNodeIds,
    );
  const currentActiveGateSelectedMembershipDeficitOpen =
    activeGateSelectedPublicationMembershipDeficitNodeIds !== null &&
    activeGateSelectedPublicationMembershipDeficitNodeIds.length > ZERO;
  const rawActiveGateSelectedNodeIds =
    resolveActiveGateSelectedMissingPublishedNodeIds(activeGateProgress);
  const activeGateSelectedEvidence = rawActiveGateSelectedNodeIds !== null ?
    Object.freeze({
      state: PUBLICATION_MISSING_PUBLISHED_ACTIVE_GATE_SELECTION_STATE.CURRENT,
      nodeIds: rawActiveGateSelectedNodeIds,
    }) :
    Object.freeze({
      state: PUBLICATION_MISSING_PUBLISHED_ACTIVE_GATE_SELECTION_STATE.ABSENT,
      nodeIds: [],
    });
  const stalePublicationClosureEvidence = hasStalePublicationClosureEvidence({
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
    rawPublicationConvergence,
    rawPublicationConvergenceGate,
  });
  const rawCoverageCanonicalNodeIds = normalizeDistinctStringArray([
    ...(Array.isArray(rawPublicationConvergenceGate?.missingPublishedNodeIds) ?
      rawPublicationConvergenceGate.missingPublishedNodeIds :
      []),
    ...(Array.isArray(rawPublicationConvergence?.missingPublishedNodeIds) ?
      rawPublicationConvergence.missingPublishedNodeIds :
      []),
  ]);
  const rawCoverageCanonicalCount = Math.max(
    rawCoverageCanonicalNodeIds.length,
    normalizeNonNegativeCount(rawPublicationConvergenceGate?.missingPublishedCount),
    normalizeNonNegativeCount(rawPublicationConvergence?.missingPublishedCount),
  );
  const rawCoverageCanonicalEvidenceAvailable =
    rawCoverageCanonicalNodeIds.length > ZERO ||
    rawCoverageCanonicalCount > ZERO ||
    Array.isArray(rawPublicationConvergenceGate?.missingPublishedNodeIds) ||
    Array.isArray(rawPublicationConvergence?.missingPublishedNodeIds) ||
    Number.isFinite(rawPublicationConvergenceGate?.missingPublishedCount) ||
    Number.isFinite(rawPublicationConvergence?.missingPublishedCount);
  const priorityRecoveryMissingPublishedNodeIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.missingPublishedNodeIds,
  );
  const coverageCanonicalNodeIds = rawCoverageCanonicalNodeIds.length > ZERO ?
    rawCoverageCanonicalNodeIds :
    currentActiveGateSelectedMembershipDeficitOpen === true ?
      activeGateSelectedPublicationMembershipDeficitNodeIds :
      rawActiveGateSelectedNodeIds !== null &&
        rawActiveGateSelectedNodeIds.length > ZERO ?
        rawActiveGateSelectedNodeIds :
      priorityRecoveryMissingPublishedNodeIds.length > ZERO ?
        priorityRecoveryMissingPublishedNodeIds :
      normalizeDistinctStringArray([
        ...(Array.isArray(publicationConvergenceGate?.missingPublishedNodeIds) ?
          publicationConvergenceGate.missingPublishedNodeIds :
          []),
        ...(Array.isArray(publicationConvergence?.missingPublishedNodeIds) ?
          publicationConvergence.missingPublishedNodeIds :
          []),
      ]);
  const coverageCanonicalCount = rawCoverageCanonicalEvidenceAvailable === true ?
    Math.max(
      rawCoverageCanonicalCount,
      coverageCanonicalNodeIds.length,
      currentActiveGateSelectedMembershipDeficitOpen === true ?
        activeGateSelectedPublicationMembershipDeficitNodeIds.length :
        ZERO,
    ) :
    Math.max(
      coverageCanonicalNodeIds.length,
      normalizeNonNegativeCount(publicationConvergenceGate?.missingPublishedCount),
      normalizeNonNegativeCount(publicationConvergence?.missingPublishedCount),
    );
  const coverageCanonicalMissingActiveNodeReasonNodeIds =
    resolvePublicationMissingActiveNodeReasonNodeIds([
      rawPublicationConvergenceGate,
      rawPublicationConvergence,
      publicationConvergenceGate,
      publicationConvergence,
      priorityRecoveryObservation,
      activeGateProgress,
    ]);
  const hasCoverageCanonicalMissingPublishedDebt =
    coverageCanonicalNodeIds.length > ZERO ||
    coverageCanonicalCount > ZERO;
  const hasCoverageCanonicalMissingActiveNodeGateDebt =
    hasCoverageCanonicalMissingPublishedDebt === true &&
    (
      currentActiveGateSelectedMembershipDeficitOpen === true ||
      (
        rawActiveGateSelectedNodeIds !== null &&
        rawActiveGateSelectedNodeIds.length > ZERO
      ) ?
        true :
        rawCoverageCanonicalEvidenceAvailable !== true ?
          true :
          coverageCanonicalNodeIds.length === ZERO ?
            coverageCanonicalMissingActiveNodeReasonNodeIds.length > ZERO :
            coverageCanonicalNodeIds.some((nodeId) =>
              coverageCanonicalMissingActiveNodeReasonNodeIds.includes(nodeId),
            )
    );
  const hasCanonicalMissingPublishedPublicationDebt =
    rawCoverageCanonicalNodeIds.length > ZERO &&
    (
      rawPublicationConvergenceGate?.publicationPending === true ||
      rawPublicationConvergence?.publicationPending === true
    );
  const canonicalNodeIds = normalizeDistinctStringArray([
    ...priorityRecoveryMissingPublishedNodeIds,
    ...(Array.isArray(publicationConvergenceGate?.missingPublishedNodeIds) ?
      publicationConvergenceGate.missingPublishedNodeIds :
      []),
    ...(Array.isArray(publicationConvergence?.missingPublishedNodeIds) ?
      publicationConvergence.missingPublishedNodeIds :
      []),
  ]);
  const canonicalCount = Math.max(
    canonicalNodeIds.length,
    normalizeNonNegativeCount(publicationConvergenceGate?.missingPublishedCount),
    normalizeNonNegativeCount(publicationConvergence?.missingPublishedCount),
  );
  const mergedNodeIds = normalizeDistinctStringArray([
    ...canonicalNodeIds,
    ...(resolveRelevantPublicationMembershipNodeIds(
      Array.isArray(activeGateProgress?.selectedMissingPublishedNodeIds) ?
        activeGateProgress.selectedMissingPublishedNodeIds :
        null,
      authoritativePublicationMembershipNodeIds,
    ) || []),
  ]);
  const mergedCount = authoritativePublicationMembershipNodeIds.length > ZERO ?
    Math.max(
      mergedNodeIds.length,
      canonicalCount,
    ) :
    Math.max(
      mergedNodeIds.length,
      canonicalCount,
      normalizeNonNegativeCount(activeGateProgress?.missingPublishedCount),
    );
  const evidence = Object.freeze({
    activeGateSnapshotCoveragePending,
    activeGatePriorityRecoveryActuationEvidenceOpen,
    hasExplicitPriorityRecoveryObservation,
    activeGateSelectedEvidence,
    stalePublicationClosureEvidence,
    rawCoverageCanonicalEvidenceAvailable,
    coverageCanonicalNodeIds,
    coverageCanonicalCount,
    hasCoverageCanonicalMissingActiveNodeGateDebt,
    canonicalNodeIds,
    canonicalCount,
    mergedNodeIds,
    mergedCount,
  });
  const rule = PUBLICATION_MISSING_PUBLISHED_EVIDENCE_RULES.find(
    (candidateRule) => candidateRule.matches(evidence),
  );
  return Object.freeze({
    state: rule.state,
    canonicalMissingActiveNodeGateDebt:
      hasCoverageCanonicalMissingActiveNodeGateDebt ||
      hasCanonicalMissingPublishedPublicationDebt,
    ...rule.select(evidence),
  });
}

export function resolvePendingRequiredAckNodeIds(pendingAckSource = null) {
  if (
    !Array.isArray(pendingAckSource?.requiredAckNodeIds) ||
    !Array.isArray(pendingAckSource?.acknowledgedNodeIds)
  ) {
    return null;
  }
  const acknowledgedNodeIdSet = new Set(
    normalizeDistinctStringArray(pendingAckSource.acknowledgedNodeIds),
  );
  const requiredAckNodeIds = normalizeDistinctStringArray(
    pendingAckSource.requiredAckNodeIds,
  );
  return requiredAckNodeIds.length > ZERO ?
    requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)) :
    null;
}

export function hasCurrentActiveGatePendingAckClosure(progress = null) {
  if (!isRecord(progress)) {
    return false;
  }
  const pendingAckNodeIds = Array.isArray(progress.pendingAckNodeIds) ?
    normalizeDistinctStringArray(progress.pendingAckNodeIds) :
    null;
  const pendingRequiredAckNodeIds = resolvePendingRequiredAckNodeIds(progress);
  const closureEvidence = Object.freeze({
    countClosed: normalizeNonNegativeCount(progress.pendingAckCount) === ZERO,
    nodeListClosed:
      pendingAckNodeIds !== null && pendingAckNodeIds.length === ZERO,
    requiredAckListClosed:
      pendingRequiredAckNodeIds !== null &&
      pendingRequiredAckNodeIds.length === ZERO,
    countOnlyClosed:
      pendingAckNodeIds === null && pendingRequiredAckNodeIds === null,
  });
  return (
    closureEvidence.countClosed === true &&
    (
      closureEvidence.nodeListClosed === true ||
      closureEvidence.requiredAckListClosed === true ||
      closureEvidence.countOnlyClosed === true
    )
  );
}

export function hasNewerBestProgressPendingAckClosure({
  activeGateProgress = null,
  bestProgressSnapshot = null,
} = {}) {
  if (
    !isRecord(activeGateProgress) ||
    !isRecord(bestProgressSnapshot) ||
    hasCurrentActiveGatePendingAckClosure(bestProgressSnapshot) !== true
  ) {
    return false;
  }
  return normalizeNonNegativeCount(bestProgressSnapshot.publicationEpoch) >
    normalizeNonNegativeCount(activeGateProgress.publicationEpoch);
}

export function selectActiveGateForPublicationConvergence({
  canonicalActiveGate = null,
  rawActiveGate = null,
} = {}) {
  const activeGateProgress =
    canonicalActiveGate?.progress ||
    rawActiveGate?.progress ||
    null;
  if (
    hasNewerBestProgressPendingAckClosure({
      activeGateProgress,
      bestProgressSnapshot: rawActiveGate?.bestProgress || null,
    }) === true
  ) {
    return rawActiveGate;
  }
  return canonicalActiveGate || rawActiveGate || null;
}

export function buildActiveGatePendingAckEvidence(progress = null) {
  if (!isRecord(progress)) {
    return Object.freeze({
      explicitNodeListOpen: false,
      requiredAckListOpen: false,
      ackStatusCountOpen: false,
    });
  }
  const pendingAckNodeIds = Array.isArray(progress.pendingAckNodeIds) ?
    normalizeDistinctStringArray(progress.pendingAckNodeIds) :
    null;
  const pendingRequiredAckNodeIds = resolvePendingRequiredAckNodeIds(progress);
  return Object.freeze({
    explicitNodeListOpen:
      pendingAckNodeIds !== null && pendingAckNodeIds.length > ZERO,
    requiredAckListOpen:
      pendingRequiredAckNodeIds !== null &&
      pendingRequiredAckNodeIds.length > ZERO,
    ackStatusCountOpen:
      normalizeNonNegativeCount(progress.pendingAckCount) > ZERO,
  });
}

export function shouldSuppressActiveGateSnapshotPublicationDebt({
  activeGatePriorityRecoveryActuationEvidenceOpen = false,
  activeGateProgress = null,
} = {}) {
  if (activeGatePriorityRecoveryActuationEvidenceOpen !== true) {
    return false;
  }
  const pendingAckEvidence =
    buildActiveGatePendingAckEvidence(activeGateProgress);
  return (
    pendingAckEvidence.explicitNodeListOpen !== true &&
    pendingAckEvidence.requiredAckListOpen !== true &&
    pendingAckEvidence.ackStatusCountOpen !== true
  );
}

export function hasActiveGatePendingAckDebt(progress = null) {
  const pendingAckEvidence = buildActiveGatePendingAckEvidence(progress);
  return (
    pendingAckEvidence.explicitNodeListOpen === true ||
    pendingAckEvidence.requiredAckListOpen === true ||
    pendingAckEvidence.ackStatusCountOpen === true
  );
}

export function resolveActiveGatePublicationDebtSuppressionProgress({
  controlPlane = null,
  priorityRecoveryObservation = null,
  activeGateProgress = null,
} = {}) {
  const rawActiveGateProgressSources = [
    controlPlane?.rawActiveGateProgress,
    controlPlane?.priorityRecoveryObservation?.rawActiveGateProgress,
    controlPlane?.priorityRecoveryObservation?.activeGate?.progress,
    controlPlane?.priorityRecoveryObservation?.activeGateProgress,
    controlPlane?.activeGate?.progress,
    controlPlane?.activeGateProgress,
  ].filter((progress) => isRecord(progress));
  const canonicalActiveGateProgressSources = [
    priorityRecoveryObservation?.activeGate?.progress,
    priorityRecoveryObservation?.activeGateProgress,
    activeGateProgress,
  ].filter((progress) => isRecord(progress));
  return rawActiveGateProgressSources.find(hasActiveGatePendingAckDebt) ||
    rawActiveGateProgressSources[ZERO] ||
    canonicalActiveGateProgressSources.find(hasActiveGatePendingAckDebt) ||
    canonicalActiveGateProgressSources[ZERO] ||
    null;
}

export function resolveCurrentPendingAckNodeIds({
  activeGateProgress = null,
  priorityRecoveryObservation = null,
  publicationConvergence = null,
  publicationConvergenceGate = null,
} = {}) {
  const pendingAckNodeIdSources = [
    publicationConvergenceGate,
    publicationConvergence,
    priorityRecoveryObservation,
    activeGateProgress,
  ];
  for (const pendingAckSource of pendingAckNodeIdSources) {
    if (!Array.isArray(pendingAckSource?.pendingAckNodeIds)) {
      continue;
    }
    const pendingAckNodeIds = normalizeDistinctStringArray(
      pendingAckSource.pendingAckNodeIds,
    );
    if (pendingAckNodeIds.length > ZERO) {
      return pendingAckNodeIds;
    }
    const pendingRequiredAckNodeIds =
      resolvePendingRequiredAckNodeIds(pendingAckSource);
    if (pendingRequiredAckNodeIds !== null) {
      return pendingRequiredAckNodeIds;
    }
  }
  return null;
}

export function buildPublicationConvergenceSummary(controlPlane) {
  const publicationEvidence =
    buildCanonicalPublicationEvidenceFromControlPlane(controlPlane);
  const publicationConvergence = publicationEvidence.publicationConvergence;
  const publicationConvergenceGate =
    publicationEvidence.publicationConvergenceGate;
  const rawPublicationConvergence = isRecord(controlPlane?.publicationConvergence) ?
    controlPlane.publicationConvergence :
    null;
  const rawPublicationConvergenceGate =
    isRecord(controlPlane?.publicationConvergenceGate) ?
      controlPlane.publicationConvergenceGate :
      isRecord(controlPlane?.publicationConvergence?.publicationRecoveryGate) ?
        controlPlane.publicationConvergence.publicationRecoveryGate :
        null;
  const priorityRecoveryDecisionSnapshots =
    controlPlane?.priorityRecoveryDecisionSnapshots &&
    typeof controlPlane.priorityRecoveryDecisionSnapshots === 'object' ?
      controlPlane.priorityRecoveryDecisionSnapshots :
      null;
  const priorityRecoveryObservation =
    publicationEvidence.priorityRecoveryObservation;
  const explicitPriorityRecoveryObservation = isRecord(
    controlPlane?.priorityRecoveryObservation,
  ) ?
    controlPlane.priorityRecoveryObservation :
    null;
  const hasActiveGatePublicationEvidence =
    isRecord(controlPlane?.activeGate) ||
    isRecord(controlPlane?.publicationConvergenceGate) ||
    isRecord(controlPlane?.activeGateProgress);
  if (
    !publicationConvergence &&
    !priorityRecoveryObservation &&
    !hasActiveGatePublicationEvidence
  ) {
    return FAILURE_BUNDLE_NO_PUBLICATION_CONVERGENCE_SUMMARY;
  }
  const blockedNodeIds = Array.from(FAILURE_BUNDLE_EMPTY_BLOCKED_NODE_IDS);
  const blockingReasonCounts = {};
  for (const [nodeId, readiness] of Object.entries(
    controlPlane?.readinessByNodeId || {},
  )) {
    const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
    const reasonCodes = reasons
      .map((reason) => String(reason?.code || '').trim())
      .filter((reason) => reason.length > ZERO);
    const publicationReasons = reasonCodes.filter(
      (reason) =>
        reason === 'control_plane_publication_pending' ||
        reason === 'publishedConvergencePending' ||
        reason === 'recovery_eligibility_pending',
    );
    if (publicationReasons.length === ZERO) {
      continue;
    }
    blockedNodeIds.push(nodeId);
    for (const reason of publicationReasons) {
      blockingReasonCounts[reason] =
        (blockingReasonCounts[reason] || ZERO) + ONE;
    }
  }
  const rawActiveGate = isRecord(controlPlane?.activeGate) ?
    controlPlane.activeGate :
    null;
  const canonicalActiveGate =
    priorityRecoveryObservation?.activeGate ||
    explicitPriorityRecoveryObservation?.activeGate ||
    rawActiveGate ||
    null;
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate: selectActiveGateForPublicationConvergence({
      canonicalActiveGate,
      rawActiveGate,
    }),
    activeGateProgress:
      priorityRecoveryObservation?.activeGateProgress ||
      explicitPriorityRecoveryObservation?.activeGateProgress ||
      controlPlane?.activeGateProgress ||
      null,
    activeGateAdmissionState:
      priorityRecoveryObservation?.activeGateAdmissionState ||
      explicitPriorityRecoveryObservation?.activeGateAdmissionState ||
      controlPlane?.activeGateAdmissionState ||
      null,
  });
  const activeGateProgress = activeGate?.progress || null;
  const bestProgressSnapshot = activeGate?.bestProgress || null;
  const rawActiveGateProgressSources = [
    controlPlane?.priorityRecoveryObservation?.activeGate?.progress,
    controlPlane?.priorityRecoveryObservation?.activeGateProgress,
    controlPlane?.activeGate?.progress,
    controlPlane?.activeGateProgress,
  ].filter((progress) => isRecord(progress));
  const activeGatePendingAckProgress =
    rawActiveGateProgressSources.find(hasActiveGatePendingAckDebt) ||
    activeGateProgress;
  const activeGatePublicationSelectionProgress =
    rawActiveGateProgressSources.find((progress) =>
      normalizeDistinctStringArray(progress?.selectedMissingPublishedNodeIds)
        .length > ZERO,
    ) ||
    rawActiveGateProgressSources.find((progress) =>
      resolveActiveGateSelectedMissingPublishedNodeIds(progress) !== null,
    ) ||
    activeGateProgress;
  const newerBestProgressPendingAckClosure =
    hasNewerBestProgressPendingAckClosure({
      activeGateProgress,
      bestProgressSnapshot,
    });
  const currentPendingAckNodeIds = resolveCurrentPendingAckNodeIds({
    activeGateProgress: activeGatePendingAckProgress,
    priorityRecoveryObservation,
    publicationConvergence,
    publicationConvergenceGate,
  });
  const rawPendingAckNodeIds = newerBestProgressPendingAckClosure ?
    [] :
    currentPendingAckNodeIds || [];
  const activeGateSnapshotCoverage =
    controlPlane?.activeGateSnapshotCoverage &&
    typeof controlPlane.activeGateSnapshotCoverage === 'object' ?
      controlPlane.activeGateSnapshotCoverage :
      null;
  const activeGateReadinessDelay = normalizeActiveGateReadinessDelay(
    activeGate?.readinessDelay ||
      activeGateProgress?.readinessDelay ||
      bestProgressSnapshot?.readinessDelay ||
      null,
  );
  const closureProgressSnapshot =
    activeGateProgress ||
    bestProgressSnapshot ||
    (activeGateSnapshotCoverage ?
      {
        snapshotCoverageComplete:
            activeGateSnapshotCoverage.completeCoverage === true,
        publicationStatus:
            publicationConvergence?.publicationStatus ||
            publicationConvergenceGate?.publicationStatus ||
            activeGateSnapshotCoverage?.selectedPublicationConvergence
              ?.publicationStatus ||
            activeGateSnapshotCoverage?.selectedPublishedMembershipObservation
              ?.publicationStatus ||
            null,
        pendingAckCount: Array.isArray(
          rawPendingAckNodeIds,
        ) ?
          rawPendingAckNodeIds.length :
          ZERO,
        missingPublishedCount: Array.isArray(
          publicationConvergenceGate?.missingPublishedNodeIds,
        ) ?
          publicationConvergenceGate.missingPublishedNodeIds.length :
          ZERO,
        recoveryProtocolState:
            priorityRecoveryObservation?.recoveryProtocolState || null,
        priorityRecoveryReasonCodes:
            priorityRecoveryObservation?.priorityRecoveryReasonCodes || [],
        gateReasons:
            publicationConvergenceGate?.reasons ||
            priorityRecoveryObservation?.publicationConvergenceGateReasons ||
            publicationConvergenceGate?.reasonCodes ||
            [],
        prioritySpreadSatisfied:
            priorityRecoveryObservation?.priorityPartitionSummary?.satisfied ===
            true ?
              true :
              priorityRecoveryObservation?.priorityPartitionSummary
                ?.satisfied === false ?
                false :
                null,
      } :
      null);
  const activeGateClosureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: closureProgressSnapshot,
    bestProgressSnapshot,
    publicationConvergence,
    publicationConvergenceGate,
    readinessMode: activeGate?.mode || null,
  });
  const decisionClosureWitness =
    priorityRecoveryDecisionSnapshots?.closureWitness &&
    typeof priorityRecoveryDecisionSnapshots.closureWitness === 'object' ?
      priorityRecoveryDecisionSnapshots.closureWitness :
      null;
  const priorityRecoveryPartitionWitnesses =
    resolvePriorityRecoveryObservationWitnesses(
      priorityRecoveryObservation?.priorityRecoveryPartitionWitnesses,
      explicitPriorityRecoveryObservation?.priorityRecoveryPartitionWitnesses,
    );
  const activePrioritySpreadGate = hasActivePrioritySpreadGate({
    decisionClosureWitness,
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
    priorityRecoveryPartitionWitnesses,
  });
  const activeGateProgressClasses = isRecord(
    activeGateProgress?.priorityRecoveryProgressClasses,
  ) ?
    activeGateProgress.priorityRecoveryProgressClasses :
    null;
  const activeGateSnapshotCoverageBlocker =
    resolveActiveGateSnapshotCoverageBlocker(activeGateProgress);
  const activeGateSnapshotCoveragePending =
    activeGateSnapshotCoverageBlocker !== null;
  const activeGatePriorityRecoveryActuationEvidenceOpen =
    activeGateSnapshotCoveragePending === true &&
    hasActiveGatePriorityRecoveryActuationEvidence({
      priorityRecoveryObservation,
      priorityRecoveryPartitionWitnesses,
      activeGateProgressClasses,
    });
  const activeGateSuppressionProgress =
    resolveActiveGatePublicationDebtSuppressionProgress({
      controlPlane,
      priorityRecoveryObservation,
      activeGateProgress,
    });
  const suppressActiveGateSnapshotPublicationDebt =
    shouldSuppressActiveGateSnapshotPublicationDebt({
      activeGatePriorityRecoveryActuationEvidenceOpen,
      activeGateProgress: activeGateSuppressionProgress,
    });
  const pendingAckNodeIds = suppressActiveGateSnapshotPublicationDebt ?
    [] :
    rawPendingAckNodeIds;
  const pendingAckCount = suppressActiveGateSnapshotPublicationDebt ?
    ZERO :
    newerBestProgressPendingAckClosure ?
      ZERO :
      currentPendingAckNodeIds !== null ?
        pendingAckNodeIds.length :
        hasCurrentActiveGatePendingAckClosure(activeGatePendingAckProgress) === true ?
          ZERO :
          Math.max(
            normalizeNonNegativeCount(
              priorityRecoveryObservation?.pendingAckCount,
            ),
            normalizeNonNegativeCount(publicationConvergence?.pendingAckCount),
            normalizeNonNegativeCount(
              publicationConvergenceGate?.pendingAckCount,
            ),
            normalizeNonNegativeCount(
              activeGatePendingAckProgress?.pendingAckCount,
            ),
            normalizeNonNegativeCount(bestProgressSnapshot?.pendingAckCount),
          );
  const missingPublishedEvidence = buildPublicationMissingPublishedEvidence({
    activeGateSnapshotCoveragePending,
    activeGatePriorityRecoveryActuationEvidenceOpen,
    hasExplicitPriorityRecoveryObservation:
      controlPlane?.hasExplicitPriorityRecoveryObservation === true,
    activeGateProgress: activeGatePublicationSelectionProgress,
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
    rawPublicationConvergence,
    rawPublicationConvergenceGate,
  });
  const fallbackSelectedMissingPublishedNodeIds = normalizeDistinctStringArray(
    activeGatePublicationSelectionProgress?.selectedMissingPublishedNodeIds,
  );
  const fallbackPriorityRecoveryMissingPublishedNodeIds =
    normalizeDistinctStringArray(priorityRecoveryObservation?.missingPublishedNodeIds);
  const fallbackMissingPublishedNodeIds =
    fallbackSelectedMissingPublishedNodeIds.length > ZERO ?
      fallbackSelectedMissingPublishedNodeIds :
      fallbackPriorityRecoveryMissingPublishedNodeIds;
  const fallbackPriorityRecoveryMissingPublishedCount =
    normalizeNonNegativeCount(priorityRecoveryObservation?.missingPublishedCount);
  const shouldUseSelectedMissingPublishedFallback =
    missingPublishedEvidence.nodeIds.length === ZERO &&
    activeGateSnapshotCoveragePending === true &&
    fallbackMissingPublishedNodeIds.length > ZERO &&
    fallbackPriorityRecoveryMissingPublishedCount > ZERO;
  const missingPublishedNodeIds = shouldUseSelectedMissingPublishedFallback ?
    fallbackMissingPublishedNodeIds :
    missingPublishedEvidence.nodeIds;
  const missingPublishedCount = shouldUseSelectedMissingPublishedFallback ?
    Math.max(fallbackMissingPublishedNodeIds.length, fallbackPriorityRecoveryMissingPublishedCount) :
    missingPublishedEvidence.count;
  const hasRawPublicationMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(
      rawPublicationConvergenceGate?.missingPublishedNodeIds,
    ),
    ...normalizeDistinctStringArray(
      rawPublicationConvergence?.missingPublishedNodeIds,
    ),
  ]).length > ZERO;
  const publicationStatus =
    priorityRecoveryObservation?.publicationStatus ||
    publicationConvergence?.publicationStatus ||
    activeGateProgress?.publicationStatus ||
    bestProgressSnapshot?.publicationStatus ||
    null;
  const explicitPublicationPendingOpen =
    priorityRecoveryObservation?.publicationPending === true ||
    publicationConvergenceGate?.publicationPending === true ||
    publicationConvergence?.publicationPending === true ||
    rawPublicationConvergence?.publicationPending === true ||
    rawPublicationConvergenceGate?.publicationPending === true ||
    explicitPriorityRecoveryObservation?.publicationPending === true;
  const rawPublicationPendingOpen =
    rawPublicationConvergence?.publicationPending === true ||
    rawPublicationConvergenceGate?.publicationPending === true ||
    explicitPriorityRecoveryObservation?.publicationPending === true;
  const coverageLagAllowsExplicitPublicationPending =
    activeGateSnapshotCoveragePending !== true ||
    (
      missingPublishedEvidence.state ===
        PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
          .CANONICAL_DURING_COVERAGE_LAG &&
      missingPublishedCount > ZERO
    );
  const canonicalCoveragePrioritySpreadPending =
    missingPublishedEvidence.state ===
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
        .CANONICAL_DURING_COVERAGE_LAG &&
    (
      publicationConvergenceGate?.prioritySpreadPending === true ||
      publicationConvergence?.prioritySpreadPending === true
    );
  const prioritySpreadPendingOpen =
    activePrioritySpreadGate === true ||
    canonicalCoveragePrioritySpreadPending;
  const newerBestProgressAckClosureWithCoverageLag =
    newerBestProgressPendingAckClosure === true &&
    activeGateSnapshotCoveragePending === true &&
    prioritySpreadPendingOpen !== true;
  const publicationAckConvergedUnderPrioritySpreadRecovery =
    hasPublishedPrioritySpreadRecoveryConvergence({
      publicationStatus,
      pendingAckCount,
      blockedNodeCount: blockedNodeIds.length,
      missingPublishedCount,
      canonicalMissingActiveNodeGateDebt:
        missingPublishedEvidence.canonicalMissingActiveNodeGateDebt ||
        hasRawPublicationMissingPublishedNodeIds,
      prioritySpreadPending: prioritySpreadPendingOpen,
    });
  const publicationPendingOpen =
    pendingAckCount > ZERO ||
    (
      missingPublishedCount > ZERO &&
      newerBestProgressAckClosureWithCoverageLag !== true &&
      publicationAckConvergedUnderPrioritySpreadRecovery !== true
    ) ||
    (
      rawPublicationPendingOpen === true &&
      newerBestProgressAckClosureWithCoverageLag !== true &&
      publicationAckConvergedUnderPrioritySpreadRecovery !== true
    ) ||
    (
      explicitPublicationPendingOpen === true &&
      coverageLagAllowsExplicitPublicationPending === true &&
      newerBestProgressAckClosureWithCoverageLag !== true &&
      publicationAckConvergedUnderPrioritySpreadRecovery !== true
    );
  const publicationRecoveryOpen =
    publicationPendingOpen ||
    pendingAckCount > ZERO ||
    blockedNodeIds.length > ZERO ||
    (
      missingPublishedCount > ZERO &&
      publicationAckConvergedUnderPrioritySpreadRecovery !== true
    );
  const rawRecoveryProtocolState =
    newerBestProgressAckClosureWithCoverageLag === true ?
      RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED :
      publicationConvergenceGate?.recoveryProtocolState ||
      publicationConvergence?.recoveryProtocolState ||
      priorityRecoveryObservation?.recoveryProtocolState ||
      activeGateProgress?.recoveryProtocolState ||
      bestProgressSnapshot?.recoveryProtocolState ||
      null;
  const recoveryProtocolState =
    resolvePublicationConvergenceRecoveryProtocolState({
      rawRecoveryProtocolState,
      activePrioritySpreadGate:
        prioritySpreadPendingOpen === true && publicationPendingOpen !== true,
      publicationRecoveryOpen,
    });
  const suppressGenericPublicationEpochReason =
    pendingAckCount === ZERO &&
    (
      activeGateSnapshotCoveragePending === true ||
      (
        missingPublishedCount > ZERO &&
        prioritySpreadPendingOpen !== true &&
        recoveryProtocolState === RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED
      )
    );
  const publicationConvergenceGateReasons = orderPublicationConvergenceReasons([
    ...(Array.isArray(
      explicitPriorityRecoveryObservation?.publicationConvergenceGateReasons,
    ) ?
      explicitPriorityRecoveryObservation.publicationConvergenceGateReasons :
      []),
    ...(Array.isArray(
      explicitPriorityRecoveryObservation?.priorityRecoveryReasonCodes,
    ) ?
      explicitPriorityRecoveryObservation.priorityRecoveryReasonCodes :
      []),
    ...(Array.isArray(
      priorityRecoveryObservation?.publicationConvergenceGateReasons,
    ) ?
      priorityRecoveryObservation.publicationConvergenceGateReasons :
      []),
    ...(Array.isArray(publicationConvergenceGate?.reasons) ?
      publicationConvergenceGate.reasons :
      []),
    ...(Array.isArray(publicationConvergenceGate?.reasonCodes) ?
      publicationConvergenceGate.reasonCodes :
      []),
    ...(Array.isArray(activeGateProgress?.gateReasons) ?
      activeGateProgress.gateReasons :
      []),
    ...(activeGateSnapshotCoverageBlocker ?
      [activeGateSnapshotCoverageBlocker] :
      []),
    ...missingPublishedNodeIds.map((nodeId) =>
      FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX + nodeId,
    ),
  ])
    .filter((reason) =>
      reason !==
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING ||
      suppressGenericPublicationEpochReason !== true,
    )
    .filter((reason) =>
      activeGateSnapshotCoveragePending !== true ||
      isPublicationMissingActiveNodeReason(reason) !== true ||
      missingPublishedNodeIds.some((nodeId) =>
        normalizeActiveGateBlockerReason(reason) ===
          FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX +
            nodeId,
      ),
    );
  const priorityRecoveryReasonCodes = orderPublicationConvergenceReasons(
    explicitPriorityRecoveryObservation?.priorityRecoveryReasonCodes ||
      priorityRecoveryObservation?.priorityRecoveryReasonCodes ||
      publicationConvergence?.priorityRecoveryReasonCodes ||
      [],
  ).filter((reason) =>
    reason !== CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING ||
    suppressGenericPublicationEpochReason !== true,
  );
  const allowPriorityRecoveryProgressSummary =
    pendingAckNodeIds.length === ZERO &&
    blockedNodeIds.length === ZERO &&
    (
      prioritySpreadPendingOpen !== true ||
      false
    ) &&
    (
      controlPlane?.hasExplicitPriorityRecoveryObservation !== true ||
      (
        publicationPendingOpen !== true &&
        (
          publicationConvergenceGate?.prioritySpreadPending !== true ||
          activeGatePriorityRecoveryActuationEvidenceOpen
        )
      )
    );
  const priorityRecoveryProgressSummary =
    allowPriorityRecoveryProgressSummary ?
      buildPriorityRecoveryProgressSummary({
        ...priorityRecoveryObservation,
        priorityRecoveryPartitionWitnesses,
      }) :
      null;
  const publicationEpoch =
    newerBestProgressPendingAckClosure === true ?
      bestProgressSnapshot?.publicationEpoch ?? null :
      priorityRecoveryObservation?.publicationEpoch ??
      publicationConvergence?.publicationEpoch ??
      activeGateProgress?.publicationEpoch ??
      bestProgressSnapshot?.publicationEpoch ??
      null;
  const priorityPartitionSummary = normalizePriorityPartitionSummary(
    priorityRecoveryObservation?.priorityPartitionSummary ||
      decisionClosureWitness?.refreshedPriorityPartitionSummary ||
      priorityRecoveryDecisionSnapshots?.priorityPartitionSummary ||
      null,
  );
  const publicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
    publicationEpoch,
    publicationStatus,
    recoveryProtocolState,
    priorityRecoveryReasonCodes,
    priorityPartitionSummary,
    pendingAckNodeIds,
    pendingAckCount,
    missingPublishedNodeIds,
    missingPublishedCount,
  });
  const publicationOwnerStream = publicationRecoveryGate.publicationOwnerStream;
  const shouldUseClosedPublishedPublicationGate =
    hasClosedPublishedPublicationRecoveryGate(publicationRecoveryGate);
  const shouldUseRecoveryGatePendingAckCount =
    shouldUsePublicationRecoveryGatePendingAckCount({
      publicationRecoveryGate,
      pendingAckCount,
      pendingAckNodeIds,
    });
  const effectivePendingAckCount =
    shouldUseClosedPublishedPublicationGate === true ||
    shouldUseRecoveryGatePendingAckCount === true ?
      publicationRecoveryGate.pendingAckCount :
      pendingAckCount;
  const shouldUseClosedUnknownPublicationGate =
    publicationRecoveryGate.publicationPending !== true &&
    publicationRecoveryGate.pendingAckCount === ZERO &&
    publicationRecoveryGate.missingPublishedCount === ZERO &&
    publicationRecoveryGate.publicationStatusNormalized ===
      PUBLICATION_OWNER_TEXT.UNKNOWN &&
    publicationRecoveryGate.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION;
  const effectivePublicationPendingOpen =
    shouldUseClosedUnknownPublicationGate === true ?
      false :
      publicationPendingOpen;
  const shouldRetireStalePublicationEpochReason =
    shouldUseClosedUnknownPublicationGate === true;
  const effectivePriorityRecoveryReasonCodes =
    shouldRetireStalePublicationEpochReason === true ?
      orderPublicationConvergenceReasons(
        priorityRecoveryReasonCodes.filter((reason) =>
          reason !==
            CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
        ),
      ) :
      priorityRecoveryReasonCodes;
  const effectivePublicationConvergenceGateReasons =
    shouldRetireStalePublicationEpochReason === true ?
      orderPublicationConvergenceReasons(
        publicationConvergenceGateReasons.filter((reason) =>
          reason !==
            CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
        ),
      ) :
      publicationConvergenceGateReasons;
  return {
    publicationEpoch,
    publicationStatus,
    ...sqlFields(controlPlane, activeGate, publicationConvergence, publicationConvergenceGate),
    ...(publicationOwnerStream ? {publicationOwnerStream} : {}),
    ...(publicationOwnerStream ?
      {
        streamOutcome: publicationOwnerStream.streamOutcome || null,
        ackState: publicationOwnerStream.ackState || null,
        freshnessFence: publicationOwnerStream.freshnessFence || null,
        recoveryOutcome: publicationOwnerStream.recoveryOutcome || null,
        publicationOwnerReasonCodes: normalizeDistinctStringArray(
          publicationOwnerStream.reasonCodes,
        ),
      } :
      {}),
    ...(publicationRecoveryGate ? {publicationRecoveryGate} : {}),
    pendingAckNodeIds,
    pendingAckCount: effectivePendingAckCount,
    blockedNodeIds,
    blockedNodeCount: blockedNodeIds.length,
    blockingReasonCounts,
    publishedActiveNodeIds: Array.isArray(
      priorityRecoveryObservation?.publishedActiveNodeIds,
    ) ?
      priorityRecoveryObservation.publishedActiveNodeIds :
      Array.isArray(publicationConvergence?.publishedActiveNodeIds) ?
        publicationConvergence.publishedActiveNodeIds :
        Array.isArray(activeGateProgress?.selectedPublishedActiveNodeIds) ?
          activeGateProgress.selectedPublishedActiveNodeIds :
          [],
    missingPublishedNodeIds,
    missingPublishedCount,
    publishedAt: publicationConvergence?.publishedAt || null,
    updatedAt: publicationConvergence?.updatedAt || null,
    recoveryProtocolState,
    priorityRecoveryReasonCodes: effectivePriorityRecoveryReasonCodes,
    publicationPending: effectivePublicationPendingOpen,
    prioritySpreadPending: prioritySpreadPendingOpen,
    publicationConvergenceGateReasons: effectivePublicationConvergenceGateReasons,
    ...(activeGate ? {activeGate} : {}),
    activeGateProgress,
    activeGateSnapshotCoveragePending,
    activeGateSnapshotCoverageBlocker,
    activeGateReadinessDelay,
    closureRecordId:
      priorityRecoveryObservation?.closureRecordId ||
      publicationConvergenceGate?.closureRecordId ||
      decisionClosureWitness?.closureRecordId ||
      activeGateClosureWitness?.closureRecordId ||
      null,
    closureWitnessClass:
      priorityRecoveryObservation?.closureWitnessClass ||
      publicationConvergenceGate?.closureWitnessClass ||
      decisionClosureWitness?.closureWitnessClass ||
      activeGateClosureWitness?.closureWitnessClass ||
      null,
    projectionDiagnostics:
      priorityRecoveryObservation?.projectionDiagnostics || null,
    priorityPartitionSummary,
    priorityRecoveryProgressClassIds:
      resolvePriorityRecoveryObservationList(
        priorityRecoveryObservation?.priorityRecoveryProgressClassIds,
        explicitPriorityRecoveryObservation?.priorityRecoveryProgressClassIds,
      ).length > ZERO ?
        resolvePriorityRecoveryObservationList(
          priorityRecoveryObservation?.priorityRecoveryProgressClassIds,
          explicitPriorityRecoveryObservation?.priorityRecoveryProgressClassIds,
        ) :
        activeGateProgressClasses?.unresolvedClassIds || [],
    priorityRecoveryProgressClassCount:
      resolvePriorityRecoveryObservationCount(
        priorityRecoveryObservation?.priorityRecoveryProgressClassCount,
        explicitPriorityRecoveryObservation?.priorityRecoveryProgressClassCount,
      ) ||
      activeGateProgressClasses?.unresolvedClassCount ||
      ZERO,
    priorityRecoverySemanticStateIds:
      resolvePriorityRecoveryObservationList(
        priorityRecoveryObservation?.priorityRecoverySemanticStateIds,
        explicitPriorityRecoveryObservation?.priorityRecoverySemanticStateIds,
      ).length > ZERO ?
        resolvePriorityRecoveryObservationList(
          priorityRecoveryObservation?.priorityRecoverySemanticStateIds,
          explicitPriorityRecoveryObservation?.priorityRecoverySemanticStateIds,
        ) :
        activeGateProgressClasses?.unresolvedSemanticStateIds || [],
    priorityRecoverySemanticStateCount:
      resolvePriorityRecoveryObservationCount(
        priorityRecoveryObservation?.priorityRecoverySemanticStateCount,
        explicitPriorityRecoveryObservation?.priorityRecoverySemanticStateCount,
      ) ||
      activeGateProgressClasses?.unresolvedSemanticStateCount ||
      ZERO,
    priorityRecoveryBlockedPartitionIds:
      resolvePriorityRecoveryObservationList(
        priorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds,
        explicitPriorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds,
      ).length > ZERO ?
        resolvePriorityRecoveryObservationList(
          priorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds,
          explicitPriorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds,
        ) :
        activeGateProgressClasses?.blockedPartitionIds || [],
    priorityRecoveryBlockedPartitionCount:
      resolvePriorityRecoveryObservationCount(
        priorityRecoveryObservation?.priorityRecoveryBlockedPartitionCount,
        explicitPriorityRecoveryObservation
          ?.priorityRecoveryBlockedPartitionCount,
      ) ||
      activeGateProgressClasses?.blockedPartitionCount ||
      ZERO,
    priorityRecoveryUnresolvedPartitionIds:
      resolvePriorityRecoveryObservationList(
        priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionIds,
        explicitPriorityRecoveryObservation
          ?.priorityRecoveryUnresolvedPartitionIds,
      ),
    priorityRecoveryUnresolvedPartitionCount:
      resolvePriorityRecoveryObservationCount(
        priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionCount,
        explicitPriorityRecoveryObservation
          ?.priorityRecoveryUnresolvedPartitionCount,
      ),
    priorityRecoveryBlockerPartitionIdsByReason:
      resolvePriorityRecoveryObservationMap(
        priorityRecoveryObservation?.priorityRecoveryBlockerPartitionIdsByReason,
        explicitPriorityRecoveryObservation
          ?.priorityRecoveryBlockerPartitionIdsByReason,
      ),
    priorityRecoveryPartitionIdsBySemanticState:
      resolvePriorityRecoveryObservationMap(
        priorityRecoveryObservation?.priorityRecoveryPartitionIdsBySemanticState,
        explicitPriorityRecoveryObservation
          ?.priorityRecoveryPartitionIdsBySemanticState,
      ),
    priorityRecoveryPartitionBlockerHistory:
      priorityRecoveryObservation?.priorityRecoveryPartitionBlockerHistory ||
      [],
    priorityRecoveryPartitionSemanticStateHistory:
      priorityRecoveryObservation
        ?.priorityRecoveryPartitionSemanticStateHistory || [],
    priorityRecoveryPartitionWitnesses,
    priorityRecoveryProgressSummary,
    priorityRecoveryAdmissionDecisionDimensions:
      priorityRecoveryObservation
        ?.priorityRecoveryAdmissionDecisionDimensions || [],
    priorityRecoveryInvariantFailingIds:
      priorityRecoveryObservation?.priorityRecoveryInvariantFailingIds || [],
    priorityRecoveryInvariantFailures:
      priorityRecoveryObservation?.priorityRecoveryInvariantFailures || [],
    priorityRecoveryInvariantCount:
      priorityRecoveryObservation?.priorityRecoveryInvariantCount || ZERO,
  };
}
