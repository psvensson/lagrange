import * as foundation from './failure-bundle-diagnostics-foundation.js';
import * as priority from './failure-bundle-diagnostics-priority-recovery.js';

const {ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD, ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG, ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT, CONTROL_PLANE_PRIORITY_RECOVERY_REASON, CONTROL_PLANE_PUBLICATION_STATUS, CONTROL_PLANE_QUIESCENCE_DISCOVERY_REASON_SET, CONTROL_PLANE_QUIESCENCE_REASON, CONTROL_PLANE_QUIESCENCE_STATE, CONTROL_PLANE_QUIESCENCE_TOPOLOGY_REASON_SET, CONTROL_PLANE_READINESS_REASON, EDGE_ID, EDGE_STATE, EMPTY_STRING, FAILURE_ARTIFACT_ACTIVE_GATE_READY_BLOCKER, FAILURE_ARTIFACT_OWNER_CONTRACT_ACTIONABLE_STATES, FAILURE_ARTIFACT_OWNER_CONTRACT_EMPTY_SUMMARY, FAILURE_ARTIFACT_PUBLICATION_GATE_BLOCKER_PREFIX, FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX, FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_BLOCKER_PREFIX, FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_SEPARATOR, FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET, FAILURE_BARRIER_ERROR_PREFIX_CONVERGENCE_TIMEOUT, FAILURE_BARRIER_ERROR_PREFIX_RESTART_RECOVERY_TIMEOUT, FAILURE_BARRIER_PHASE_CONVERGENCE, FAILURE_BARRIER_PHASE_RESTART_RECOVERY, FAILURE_BARRIER_REASON_CONVERGENCE_TIMEOUT, FAILURE_BARRIER_REASON_COUNT, FAILURE_BARRIER_REASON_RESTART_RECOVERY_TIMEOUT, FAILURE_BARRIER_SUPERSEDED_REASON_FRAGMENT_SET, FAILURE_BARRIER_SUPERSEDED_ROOT_CAUSE_CLASS_SET, FAILURE_BUNDLE_SEGMENT_3, FINAL_CONSISTENCY_CACHE_REASON_SET, FINAL_CONSISTENCY_CACHE_STATE_SET, FINAL_CONSISTENCY_CDC_REASON_SET, FINAL_CONSISTENCY_CDC_STATE_SET, FINAL_CONSISTENCY_LEADER_MISMATCH_MESSAGE_PREFIX, FINAL_CONSISTENCY_REASON_CDC_VISIBILITY_LAG, FINAL_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE, FINAL_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG, FINAL_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG, FINAL_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED, FINAL_CONSISTENCY_REASON_TRANSPORT_DELIVERY_DEFERRED, FINAL_CONSISTENCY_REASON_UNCLASSIFIED, FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED, FINAL_CONSISTENCY_STATE_CDC_VISIBILITY_LAG, FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH, FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG, FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG, FINAL_CONSISTENCY_STATE_TRANSPORT_DELIVERY_DEFERRED, FINAL_CONSISTENCY_TOPOLOGY_REASON_SET, FINAL_CONSISTENCY_TOPOLOGY_STATE_SET, JS_OBJECT_TYPE, LOAD_WAIT_REASON_ATTEMPT_ERRORS, LOAD_WAIT_REASON_HARD_LOAD_FAILURES, ONE, PRIORITY_RECOVERY_ACTUATION_STATE, PRIORITY_RECOVERY_BLOCKER_REASON, PRIORITY_RECOVERY_BLOCKING_BOUNDARY, PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE, PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION, PRIORITY_RECOVERY_PROGRESS_OWNER, PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD, PRIORITY_RECOVERY_SEMANTIC_STATE, PRIORITY_RECOVERY_WITNESS_FRESHNESS_KEY_SEPARATOR, PRIORITY_RECOVERY_WORKFLOW_PROGRESS_ACTUATION_STATES, PUBLICATION_MISSING_PUBLISHED_ACTIVE_GATE_SELECTION_STATE, PUBLICATION_MISSING_PUBLISHED_EVIDENCE_RULES, PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE, PUBLICATION_OWNER_ACK_STATE, PUBLICATION_OWNER_FRESHNESS_FENCE, PUBLICATION_OWNER_RECOVERY_OUTCOME, PUBLICATION_OWNER_STREAM_OUTCOME, PUBLICATION_OWNER_TEXT, PUBLICATION_RECOVERY_GATE_STATE, PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE, READINESS_DIMENSION_CONTROL_PLANE_RECOVERY_ELIGIBLE, READINESS_DIMENSION_REPAIR_ELIGIBLE, READINESS_REASON_CONTROL_PLANE_PUBLICATION_PENDING, READINESS_REASON_CONTROL_PLANE_WRITE_UNHEALTHY, READINESS_REASON_PUBLISHED_CONVERGENCE_PENDING, READINESS_REASON_RECOVERY_ELIGIBILITY_PENDING, REASON, RECOVERY_PROTOCOL_STATE, RESTART_RECOVERY_READINESS_ADMIN_REFUSED_FRAGMENT, RESTART_RECOVERY_READINESS_BOOLEAN_FALSE, RESTART_RECOVERY_READINESS_BOOLEAN_TRUE, RESTART_RECOVERY_READINESS_FIELD, RESTART_RECOVERY_READINESS_FIELD_SEPARATOR, RESTART_RECOVERY_READINESS_FIELD_VALUE_SEPARATOR, RESTART_RECOVERY_READINESS_NODE_MARKER, RESTART_RECOVERY_READINESS_NO_VALUE, RESTART_RECOVERY_READINESS_OBSERVATION_END_MARKER, RESTART_RECOVERY_READINESS_OBSERVATION_START_MARKER, RESTART_RECOVERY_READINESS_REACHABLE_BY_BOOTSTRAP_HEALTH, RESTART_RECOVERY_READINESS_UNKNOWN_VALUE, buildCanonicalControlPlaneDiagnosticsFromControlPlane, buildCanonicalPublicationEvidenceFromControlPlane, buildPriorityRecoveryProgressSummary, buildPublicationRecoveryGateSnapshot, buildTopologyConvergenceGraphFromArtifacts, buildTopologyConvergenceOwnerPresentation, classifyActiveGateClosureWitness, normalizePriorityRecoveryActiveGateSnapshot, normalizePriorityRecoveryPartitionWitnessesForDiagnostics} = Object.assign({}, foundation);
const {
  FIRST_FAULT_MARKER_ATTEMPT_ERRORS,
  FIRST_FAULT_MARKER_HARD_FAILURE,
  FIRST_FAULT_MARKER_QUEUE_PRESSURE,
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  NODE_DIAGNOSTICS_TRACE_LIMIT,
  ROOT_CAUSE_CLASS_CACHE,
  ROOT_CAUSE_CLASS_CDC,
  ROOT_CAUSE_CLASS_DISCOVERY,
  ROOT_CAUSE_CLASS_STARTUP,
  ROOT_CAUSE_CLASS_TOPOLOGY,
  ROOT_CAUSE_CLASS_UNKNOWN,
  STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  ZERO,
  addNormalizedReasonCount,
  cloneJsonValue,
  extractNodeIdsFromText,
  hasPrioritySpreadReasonCode,
  isRecord,
  mergeByNodeIdMaps,
  mergePriorityRecoveryDecisionSnapshots,
  mergePriorityRecoveryInvariants,
  mergeRetainedPriorityRecoveryObservation,
  normalizeDistinctStringArray,
  normalizeNonNegativeCount,
  normalizePriorityRecoveryDecisionSnapshots,
  normalizePriorityRecoveryInvariants,
  resolveAdminQueryTraceByNodeId,
  resolveControlSnapshot,
  resolveFailureDiagnostics,
  resolveLoadMetrics,
  resolvePriorityRecoveryObservationWitnesses,
  resolveRelevantNodeIds,
  resolveRoutingDiagnostics,
  selectActiveGateForPublicationConvergence,
} = Object.assign({}, foundation, priority);

export function attachCanonicalPublicationEvidence(controlPlane) {
  if (!isRecord(controlPlane)) {
    return null;
  }
  const canonicalControlPlane =
    buildCanonicalControlPlaneDiagnosticsFromControlPlane(controlPlane);
  return {
    ...canonicalControlPlane,
    rawActiveGateProgress:
      controlPlane.activeGate?.progress ||
      controlPlane.activeGateProgress ||
      null,
    activeGate: selectActiveGateForPublicationConvergence({
      canonicalActiveGate: canonicalControlPlane?.activeGate || null,
      rawActiveGate: controlPlane.activeGate || null,
    }),
    priorityRecoveryObservation: mergeRetainedPriorityRecoveryObservation(
      canonicalControlPlane?.priorityRecoveryObservation,
      controlPlane.priorityRecoveryObservation,
    ),
  };
}

export function mergePriorityRecoveryObservationSnapshots(primaryObservation, fallbackObservation) {
  const hasPrimaryObservation = isRecord(primaryObservation);
  const hasFallbackObservation = isRecord(fallbackObservation);
  if (!hasPrimaryObservation && !hasFallbackObservation) {
    return null;
  }
  if (!hasPrimaryObservation) {
    return fallbackObservation;
  }
  if (!hasFallbackObservation) {
    return primaryObservation;
  }
  return {
    ...fallbackObservation,
    ...primaryObservation,
    priorityRecoveryPartitionWitnesses:
      resolvePriorityRecoveryObservationWitnesses(
        primaryObservation.priorityRecoveryPartitionWitnesses,
        fallbackObservation.priorityRecoveryPartitionWitnesses,
      ),
  };
}

export function mergeControlPlaneDiagnostics(primary, fallback) {
  const hasPrimary = isRecord(primary);
  const hasFallback = isRecord(fallback);
  if (!hasPrimary && !hasFallback) {
    return null;
  }
  if (!hasPrimary) {
    return attachCanonicalPublicationEvidence({
      ...fallback,
      hasExplicitPriorityRecoveryObservation:
        isRecord(fallback?.priorityRecoveryObservation),
      priorityRecoveryDecisionSnapshots:
        normalizePriorityRecoveryDecisionSnapshots(
          fallback?.priorityRecoveryDecisionSnapshots,
        ),
      priorityRecoveryInvariants: normalizePriorityRecoveryInvariants(
        fallback?.priorityRecoveryInvariants,
      ),
    });
  }
  if (!hasFallback) {
    return attachCanonicalPublicationEvidence({
      ...primary,
      hasExplicitPriorityRecoveryObservation:
        isRecord(primary?.priorityRecoveryObservation),
      priorityRecoveryDecisionSnapshots:
        normalizePriorityRecoveryDecisionSnapshots(
          primary?.priorityRecoveryDecisionSnapshots,
        ),
      priorityRecoveryInvariants: normalizePriorityRecoveryInvariants(
        primary?.priorityRecoveryInvariants,
      ),
    });
  }

  return attachCanonicalPublicationEvidence({
    ...fallback,
    ...primary,
    hasExplicitPriorityRecoveryObservation:
      isRecord(primary?.priorityRecoveryObservation) ||
      isRecord(fallback?.priorityRecoveryObservation),
    publicationConvergence:
      primary.publicationConvergence || fallback.publicationConvergence || null,
    publicationConvergenceGate:
      primary.publicationConvergenceGate ||
      fallback.publicationConvergenceGate ||
      null,
    publishedMembershipObservation:
      primary.publishedMembershipObservation ||
      fallback.publishedMembershipObservation ||
      null,
    activeGateSnapshotCoverage:
      primary.activeGateSnapshotCoverage ||
      fallback.activeGateSnapshotCoverage ||
      null,
    activeGate:
      primary.activeGate ||
      fallback.activeGate ||
      null,
    activeGateProgress:
      primary.activeGateProgress || fallback.activeGateProgress || null,
    priorityRecoveryObservation: mergePriorityRecoveryObservationSnapshots(
      primary.priorityRecoveryObservation,
      fallback.priorityRecoveryObservation,
    ),
    readinessByNodeId: mergeByNodeIdMaps(
      primary.readinessByNodeId,
      fallback.readinessByNodeId,
    ),
    nodeLivenessByNodeId: mergeByNodeIdMaps(
      primary.nodeLivenessByNodeId,
      fallback.nodeLivenessByNodeId,
    ),
    readinessTransitionsByNodeId: mergeByNodeIdMaps(
      primary.readinessTransitionsByNodeId,
      fallback.readinessTransitionsByNodeId,
    ),
    placementEligibilityByNodeId: mergeByNodeIdMaps(
      primary.placementEligibilityByNodeId,
      fallback.placementEligibilityByNodeId,
    ),
    publicationModeByNodeId: mergeByNodeIdMaps(
      primary.publicationModeByNodeId,
      fallback.publicationModeByNodeId,
    ),
    heartbeatPublicationByNodeId: mergeByNodeIdMaps(
      primary.heartbeatPublicationByNodeId,
      fallback.heartbeatPublicationByNodeId,
    ),
    priorityRecoveryDecisionSnapshots: mergePriorityRecoveryDecisionSnapshots(
      primary.priorityRecoveryDecisionSnapshots,
      fallback.priorityRecoveryDecisionSnapshots,
    ),
    priorityRecoveryInvariants: mergePriorityRecoveryInvariants(
      primary.priorityRecoveryInvariants,
      fallback.priorityRecoveryInvariants,
    ),
  });
}

export function mergeControlSnapshotByNodeId(primary, fallback) {
  const hasPrimary = isRecord(primary);
  const hasFallback = isRecord(fallback);
  if (!hasPrimary && !hasFallback) {
    return null;
  }
  return {
    ...(hasFallback ? fallback : {}),
    ...(hasPrimary ? primary : {}),
  };
}

export function buildFocusedNodeDiagnostics(
  entry,
  logs,
  controlPlaneDiagnostics = null,
  mergedControlSnapshotByNodeId = null,
  timelineCorrelationByNodeId = null,
) {
  const relevantNodeIds = resolveRelevantNodeIds(entry);
  const loadMetrics = resolveLoadMetrics(entry);
  const perNodeMetrics =
    loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' &&
    !Array.isArray(loadMetrics.perNode) ?
      loadMetrics.perNode :
      {};
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  const failedPhaseErrors = Array.isArray(
    resolveFailureDiagnostics(entry)?.failedPhase?.errors,
  ) ?
    resolveFailureDiagnostics(entry).failedPhase.errors :
    [];
  const errorTexts = [...failedPhaseErrors, ...distinctErrors];
  const controlSnapshotByNodeId = isRecord(mergedControlSnapshotByNodeId) ?
    mergedControlSnapshotByNodeId :
    resolveControlSnapshot(entry) || {};
  const adminQueryTraceByNodeId = resolveAdminQueryTraceByNodeId(entry) || {};
  const nodeDiagnostics = {};

  for (const nodeId of relevantNodeIds) {
    const matchingErrors = errorTexts.filter((errorText) =>
      extractNodeIdsFromText(errorText).includes(nodeId),
    );
    const traceEntries = Array.isArray(adminQueryTraceByNodeId[nodeId]) ?
      adminQueryTraceByNodeId[nodeId].slice(-NODE_DIAGNOSTICS_TRACE_LIMIT) :
      [];
    const readiness =
      controlPlaneDiagnostics?.readinessByNodeId?.[nodeId] || null;
    const nodeLiveness =
      controlPlaneDiagnostics?.nodeLivenessByNodeId?.[nodeId] || null;
    const placementEligibility =
      controlPlaneDiagnostics?.placementEligibilityByNodeId?.[nodeId] || null;
    const publicationMode =
      controlPlaneDiagnostics?.publicationModeByNodeId?.[nodeId] || null;
    const heartbeatPublication =
      controlPlaneDiagnostics?.heartbeatPublicationByNodeId?.[nodeId] || null;
    const readinessTransitions = Array.isArray(
      controlPlaneDiagnostics?.readinessTransitionsByNodeId?.[nodeId],
    ) ?
      controlPlaneDiagnostics.readinessTransitionsByNodeId[nodeId] :
      [];
    const participationDecisions = Array.isArray(
      controlPlaneDiagnostics?.participationDecisions,
    ) ?
      controlPlaneDiagnostics.participationDecisions.filter(
        (entry) => entry?.nodeId === nodeId,
      ) :
      [];
    const authoritativeReadinessRepairs = Array.isArray(
      controlPlaneDiagnostics?.authoritativeReadinessRepairs,
    ) ?
      controlPlaneDiagnostics.authoritativeReadinessRepairs.filter(
        (entry) => entry?.nodeId === nodeId,
      ) :
      [];
    const recoveryEpochs = Array.isArray(
      controlPlaneDiagnostics?.recoveryEpochsByNodeId?.[nodeId],
    ) ?
      controlPlaneDiagnostics.recoveryEpochsByNodeId[nodeId] :
      [];
    const controlPlaneOperations = Array.isArray(
      controlPlaneDiagnostics?.controlPlaneOperations,
    ) ?
      controlPlaneDiagnostics.controlPlaneOperations.filter(
        (entry) => entry?.nodeId === nodeId,
      ) :
      [];
    const timelineCorrelation = timelineCorrelationByNodeId?.[nodeId] || null;
    const nodeLogPath = logs?.nodeLogPaths?.[nodeId] || null;
    const logExcerpt = Array.isArray(logs?.excerptsByNodeId?.[nodeId]) ?
      logs.excerptsByNodeId[nodeId] :
      [];
    const decisionArtifacts = logs?.decisionArtifactsByNodeId?.[nodeId] || null;
    const restartBoundaries = Array.isArray(
      logs?.restartBoundariesByNodeId?.[nodeId],
    ) ?
      logs.restartBoundariesByNodeId[nodeId] :
      [];
    const routingDiagnostics = resolveRoutingDiagnostics(logExcerpt);
    if (
      !perNodeMetrics[nodeId] &&
      matchingErrors.length === ZERO &&
      !controlSnapshotByNodeId[nodeId] &&
      traceEntries.length === ZERO &&
      !readiness &&
      !nodeLiveness &&
      !placementEligibility &&
      !publicationMode &&
      !heartbeatPublication &&
      readinessTransitions.length === ZERO &&
      participationDecisions.length === ZERO &&
      authoritativeReadinessRepairs.length === ZERO &&
      recoveryEpochs.length === ZERO &&
      controlPlaneOperations.length === ZERO &&
      !timelineCorrelation &&
      !decisionArtifacts &&
      restartBoundaries.length === ZERO &&
      !routingDiagnostics &&
      !nodeLogPath &&
      logExcerpt.length === ZERO
    ) {
      continue;
    }
    nodeDiagnostics[nodeId] = {
      loadMetrics: perNodeMetrics[nodeId] || null,
      errors: matchingErrors,
      adminQueryTrace: traceEntries,
      controlSnapshot: controlSnapshotByNodeId[nodeId] || null,
      readiness,
      nodeLiveness,
      placementEligibility,
      publicationMode,
      heartbeatPublication,
      readinessTransitions,
      participationDecisions,
      authoritativeReadinessRepairs,
      recoveryEpochs,
      controlPlaneOperations,
      timelineCorrelation,
      decisionArtifacts,
      restartBoundaries,
      routingDiagnostics,
      logPath: nodeLogPath,
      logExcerpt,
    };
  }

  return nodeDiagnostics;
}

export function resolveFirstFaultTimeline(entry, fallbackTimeline = null) {
  const diagnostics = resolveFailureDiagnostics(entry);
  if (isRecord(diagnostics?.firstFaultTimeline)) {
    return diagnostics.firstFaultTimeline;
  }
  return isRecord(fallbackTimeline) ? fallbackTimeline : null;
}

export function mapFirstFaultMarkerToReason(marker) {
  if (marker === FIRST_FAULT_MARKER_QUEUE_PRESSURE) {
    return LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE;
  }
  if (marker === FIRST_FAULT_MARKER_ATTEMPT_ERRORS) {
    return LOAD_WAIT_REASON_ATTEMPT_ERRORS;
  }
  if (marker === FIRST_FAULT_MARKER_HARD_FAILURE) {
    return LOAD_WAIT_REASON_HARD_LOAD_FAILURES;
  }
  return null;
}

export function resolveDominantReasonFromFirstFaultTimeline(firstFaultTimeline) {
  const orderedMarkers = Array.isArray(firstFaultTimeline?.orderedMarkers) ?
    firstFaultTimeline.orderedMarkers :
    [];
  if (orderedMarkers.length === ZERO) {
    return null;
  }
  return mapFirstFaultMarkerToReason(orderedMarkers[ZERO].marker);
}


export function resolveFinalConsistencyRootCauseClass(finalConsistency) {
  const reasonCode = String(finalConsistency?.reasonCode || '').trim();
  const state = String(finalConsistency?.state || '').trim();
  if (
    FINAL_CONSISTENCY_CACHE_REASON_SET.has(reasonCode) ||
    FINAL_CONSISTENCY_CACHE_STATE_SET.has(state)
  ) {
    return ROOT_CAUSE_CLASS_CACHE;
  }
  if (
    FINAL_CONSISTENCY_CDC_REASON_SET.has(reasonCode) ||
    FINAL_CONSISTENCY_CDC_STATE_SET.has(state)
  ) {
    return ROOT_CAUSE_CLASS_CDC;
  }
  if (
    FINAL_CONSISTENCY_TOPOLOGY_REASON_SET.has(reasonCode) ||
    FINAL_CONSISTENCY_TOPOLOGY_STATE_SET.has(state)
  ) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  return ROOT_CAUSE_CLASS_UNKNOWN;
}

export function resolveStructuredFinalConsistencyFailure(controlPlane) {
  const finalConsistency =
    controlPlane?.finalConsistency &&
    typeof controlPlane.finalConsistency === JS_OBJECT_TYPE &&
    !Array.isArray(controlPlane.finalConsistency) ?
      controlPlane.finalConsistency :
      null;
  const finalConsistencyReason = finalConsistency ?
    String(
      finalConsistency.reasonCode ||
        finalConsistency.state ||
        FINAL_CONSISTENCY_REASON_UNCLASSIFIED,
    ).trim() :
    null;
  const mismatchReason = String(
    controlPlane?.mismatch?.reasonCode || EMPTY_STRING,
  ).trim();
  const finalConsistencyCandidate = finalConsistencyReason ?
    {
      reasonCode: finalConsistencyReason,
      rootCauseEvidence: {
        ...finalConsistency,
        reasonCode: finalConsistencyReason,
      },
    } :
    null;
  const mismatchCandidate =
    !finalConsistencyCandidate && mismatchReason.length > ZERO ?
      {
        reasonCode: mismatchReason,
        rootCauseEvidence: {reasonCode: mismatchReason},
      } :
      null;
  const selectedCandidate = finalConsistencyCandidate || mismatchCandidate;
  return selectedCandidate ?
    {
      dominantReason: selectedCandidate.reasonCode,
      rootCauseClass: resolveFinalConsistencyRootCauseClass(
        selectedCandidate.rootCauseEvidence,
      ),
    } :
    null;
}

export function resolveFinalConsistencyFailureFromMessage(entry) {
  const errorMessage = String(entry?.error || '');
  if (errorMessage.includes(FINAL_CONSISTENCY_LEADER_MISMATCH_MESSAGE_PREFIX)) {
    return {
      dominantReason: FINAL_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE,
      rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
    };
  }
  return null;
}

export function resolveFinalConsistencyFailure(entry, controlPlane) {
  return (
    resolveStructuredFinalConsistencyFailure(controlPlane) ||
    resolveFinalConsistencyFailureFromMessage(entry)
  );
}

export function resolveControlPlaneQuiescenceRootCauseClass(quiescence) {
  const state = String(quiescence?.state || '').trim();
  const canonicalBlocker = String(quiescence?.canonicalBlocker || '').trim();
  if (
    CONTROL_PLANE_QUIESCENCE_DISCOVERY_REASON_SET.has(canonicalBlocker) ||
    CONTROL_PLANE_QUIESCENCE_DISCOVERY_REASON_SET.has(state)
  ) {
    return ROOT_CAUSE_CLASS_DISCOVERY;
  }
  if (
    CONTROL_PLANE_QUIESCENCE_TOPOLOGY_REASON_SET.has(canonicalBlocker) ||
    CONTROL_PLANE_QUIESCENCE_TOPOLOGY_REASON_SET.has(state)
  ) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  return ROOT_CAUSE_CLASS_UNKNOWN;
}

export function resolveStructuredControlPlaneQuiescenceFailure(diagnostics) {
  const quiescence = isRecord(diagnostics?.quiescence) ?
    diagnostics.quiescence :
    null;
  if (!quiescence) {
    return null;
  }
  const canonicalBlocker = String(quiescence.canonicalBlocker || '').trim();
  const state = String(quiescence.state || '').trim();
  const dominantReason = canonicalBlocker || state;
  if (dominantReason.length === ZERO) {
    return null;
  }
  const reasonCounts = {};
  for (const reasonCode of normalizeDistinctStringArray(
    quiescence.reasonCodes,
  )) {
    addNormalizedReasonCount(reasonCounts, reasonCode);
  }
  addNormalizedReasonCount(reasonCounts, dominantReason);
  return {
    dominantReason,
    rootCauseClass: resolveControlPlaneQuiescenceRootCauseClass(quiescence),
    reasonCounts,
    quiescence: cloneJsonValue(quiescence),
  };
}

export function hasOpenPublicationOrPriorityRecoveryBlocker(publicationConvergence) {
  if (!isRecord(publicationConvergence)) {
    return false;
  }
  return (
    publicationConvergence.publicationPending === true ||
    hasPublicationMissingActiveNodeBlocker(publicationConvergence) ||
    normalizeNonNegativeCount(publicationConvergence.pendingAckCount) > ZERO ||
    normalizeNonNegativeCount(publicationConvergence.blockedNodeCount) > ZERO ||
    publicationConvergence.prioritySpreadPending === true ||
    normalizeNonNegativeCount(
      publicationConvergence.priorityRecoveryProgressClassCount,
    ) > ZERO ||
    normalizeNonNegativeCount(
      publicationConvergence.priorityRecoverySemanticStateCount,
    ) > ZERO ||
    normalizeNonNegativeCount(
      publicationConvergence.priorityRecoveryBlockedPartitionCount,
    ) > ZERO ||
    normalizeNonNegativeCount(
      publicationConvergence.priorityRecoveryUnresolvedPartitionCount,
    ) > ZERO ||
    normalizeDistinctStringArray(
      publicationConvergence.priorityRecoveryProgressClassIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      publicationConvergence.priorityRecoverySemanticStateIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      publicationConvergence.priorityRecoveryBlockedPartitionIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      publicationConvergence.priorityRecoveryUnresolvedPartitionIds,
    ).length > ZERO
  );
}

export function resolvePublicationBlockedDominantReason(publicationConvergence) {
  if (!isRecord(publicationConvergence)) {
    return null;
  }
  if (normalizeNonNegativeCount(publicationConvergence.pendingAckCount) > ZERO) {
    return STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT;
  }
  if (normalizeNonNegativeCount(publicationConvergence.blockedNodeCount) > ZERO) {
    return STABILITY_GATE_BLOCKER_BLOCKED_NODES;
  }
  if (publicationConvergence.publicationPending === true) {
    return STABILITY_GATE_BLOCKER_PUBLICATION_PENDING;
  }
  return null;
}

export function normalizeActiveGateBlockerReason(reason) {
  const normalizedReason = String(reason || '').trim();
  return normalizedReason.startsWith(
    FAILURE_ARTIFACT_PUBLICATION_GATE_BLOCKER_PREFIX,
  ) ?
    normalizedReason.slice(
      FAILURE_ARTIFACT_PUBLICATION_GATE_BLOCKER_PREFIX.length,
    ) :
    normalizedReason;
}

export function isPublicationMissingActiveNodeReason(reason) {
  return normalizeActiveGateBlockerReason(reason).startsWith(
    FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX,
  );
}

export function resolvePublicationMissingActiveNodeReasonNodeIds(reasonSources = []) {
  const reasonNodeIds = [];
  for (const source of reasonSources) {
    const reasons = normalizeDistinctStringArray([
      ...(Array.isArray(source?.publicationConvergenceGateReasons) ?
        source.publicationConvergenceGateReasons :
        []),
      ...(Array.isArray(source?.priorityRecoveryReasonCodes) ?
        source.priorityRecoveryReasonCodes :
        []),
      ...(Array.isArray(source?.reasons) ? source.reasons : []),
      ...(Array.isArray(source?.reasonCodes) ? source.reasonCodes : []),
      ...(Array.isArray(source?.gateReasons) ? source.gateReasons : []),
      ...(Array.isArray(source?.blockers) ? source.blockers : []),
    ]);
    for (const reason of reasons) {
      const normalizedReason = normalizeActiveGateBlockerReason(reason);
      if (
        !normalizedReason.startsWith(
          FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX,
        )
      ) {
        continue;
      }
      const nodeId = normalizedReason.slice(
        FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX.length,
      );
      if (nodeId.length > ZERO) {
        reasonNodeIds.push(nodeId);
      }
    }
  }
  return normalizeDistinctStringArray(reasonNodeIds);
}

export function resolveActiveGateSnapshotCoverageBlocker(progress = null) {
  if (!isRecord(progress)) {
    return null;
  }
  const explicitBlocker = normalizeDistinctStringArray([
    ...(Array.isArray(progress.gateReasons) ? progress.gateReasons : []),
    ...(Array.isArray(progress.blockers) ? progress.blockers : []),
  ])
    .map((reason) => normalizeActiveGateBlockerReason(reason))
    .find((reason) =>
      reason.startsWith(FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_BLOCKER_PREFIX),
    );
  if (progress.snapshotCoverageComplete !== false) {
    return null;
  }
  if (explicitBlocker) {
    return explicitBlocker;
  }
  const expectedNodeCount = normalizeNonNegativeCount(
    progress.expectedNodeCount,
  );
  const snapshotCoverageNodeCount = normalizeNonNegativeCount(
    progress.snapshotCoverageNodeCount,
  );
  return expectedNodeCount > ZERO ?
    FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_BLOCKER_PREFIX +
      String(snapshotCoverageNodeCount) +
      FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_SEPARATOR +
      String(expectedNodeCount) :
    null;
}

export function hasActiveGateSnapshotCoveragePending(publicationConvergence) {
  const progress =
    publicationConvergence?.activeGateProgress ||
    publicationConvergence?.activeGate?.progress ||
    null;
  return resolveActiveGateSnapshotCoverageBlocker(progress) !== null;
}

export function collectPublicationMissingActiveNodeReasonCandidates(
  publicationConvergence,
) {
  const activeGateProgress =
    publicationConvergence?.activeGateProgress ||
    publicationConvergence?.activeGate?.progress ||
    null;
  return normalizeDistinctStringArray([
    ...(Array.isArray(publicationConvergence?.publicationConvergenceGateReasons) ?
      publicationConvergence.publicationConvergenceGateReasons :
      []),
    ...(Array.isArray(publicationConvergence?.priorityRecoveryReasonCodes) ?
      publicationConvergence.priorityRecoveryReasonCodes :
      []),
    ...(Array.isArray(activeGateProgress?.gateReasons) ?
      activeGateProgress.gateReasons :
      []),
    ...(Array.isArray(activeGateProgress?.blockers) ?
      activeGateProgress.blockers :
      []),
  ]).map((reason) => normalizeActiveGateBlockerReason(reason));
}

export function resolvePublicationMissingActiveNodeReason(publicationConvergence) {
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    publicationConvergence?.missingPublishedNodeIds,
  );
  const missingPublishedCount = normalizeNonNegativeCount(
    publicationConvergence?.missingPublishedCount,
  );
  const snapshotCoveragePending =
    hasActiveGateSnapshotCoveragePending(publicationConvergence);
  const hasMissingPublishedDebt =
    missingPublishedNodeIds.length > ZERO || missingPublishedCount > ZERO;
  if (snapshotCoveragePending && hasMissingPublishedDebt !== true) {
    return null;
  }
  const reason = collectPublicationMissingActiveNodeReasonCandidates(
    publicationConvergence,
  ).find((candidate) =>
    snapshotCoveragePending !== true &&
    candidate.startsWith(
      FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX,
    ),
  );
  if (reason) {
    return reason;
  }
  if (missingPublishedNodeIds.length > ZERO) {
    return FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX +
      missingPublishedNodeIds[ZERO];
  }
  return missingPublishedCount > ZERO ?
    STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE :
    null;
}

export function hasPublicationMissingActiveNodeBlocker(publicationConvergence) {
  return resolvePublicationMissingActiveNodeReason(publicationConvergence) !==
    null;
}

export function resolveActiveGateDominantBlockerReason(publicationConvergence) {
  const activeGateProgress =
    publicationConvergence?.activeGateProgress ||
    publicationConvergence?.activeGate?.progress ||
    null;
  const snapshotCoverageBlocker =
    resolveActiveGateSnapshotCoverageBlocker(activeGateProgress);
  if (snapshotCoverageBlocker) {
    return snapshotCoverageBlocker;
  }
  const blockers = normalizeDistinctStringArray(
    activeGateProgress?.blockers,
  ).map((blocker) => normalizeActiveGateBlockerReason(blocker));
  return blockers.find((blocker) =>
    blocker.startsWith(
      FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX,
    ),
  ) || blockers.find(
    (blocker) => blocker !== FAILURE_ARTIFACT_ACTIVE_GATE_READY_BLOCKER,
  ) || null;
}

export function resolveDominantReasonOverride({
  existingDominantReason,
  publicationConvergence,
  progressDominantReason = null,
}) {
  const currentPublicationBlockedReason =
    resolvePublicationBlockedDominantReason(publicationConvergence);
  if (
    currentPublicationBlockedReason ===
    STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT
  ) {
    return currentPublicationBlockedReason;
  }
  const normalizedExistingDominantReason = String(
    existingDominantReason || '',
  ).trim();
  const existingReasonOwnsPriorityRecoveryProgress =
    progressDominantReason &&
    normalizedExistingDominantReason === progressDominantReason;
  const missingActiveNodeReason = resolvePublicationMissingActiveNodeReason(
    publicationConvergence,
  );
  if (
    missingActiveNodeReason &&
    existingReasonOwnsPriorityRecoveryProgress !== true
  ) {
    return missingActiveNodeReason;
  }
  if (
    currentPublicationBlockedReason &&
    existingReasonOwnsPriorityRecoveryProgress === true
  ) {
    return null;
  }
  if (currentPublicationBlockedReason) {
    return currentPublicationBlockedReason;
  }
  if (
    !FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET.has(
      normalizedExistingDominantReason,
    ) ||
    hasOpenPublicationOrPriorityRecoveryBlocker(publicationConvergence)
  ) {
    return null;
  }
  return resolveActiveGateDominantBlockerReason(publicationConvergence);
}

export function filterReasonCountsForPublicationMissingActiveNode({
  reasonCounts,
  publicationConvergence,
}) {
  if (!isRecord(reasonCounts)) {
    return reasonCounts;
  }
  const pendingAckCount = normalizeNonNegativeCount(
    publicationConvergence?.pendingAckCount,
  );
  if (pendingAckCount > ZERO) {
    const filteredReasonCounts = {};
    for (const [reason, count] of Object.entries(reasonCounts)) {
      const normalizedReason = normalizeActiveGateBlockerReason(reason);
      if (
        FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET.has(normalizedReason) ||
        normalizedReason ===
          STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE ||
        normalizedReason.startsWith(
          FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX,
        )
      ) {
        continue;
      }
      addNormalizedReasonCount(filteredReasonCounts, normalizedReason, count);
    }
    addNormalizedReasonCount(
      filteredReasonCounts,
      STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
      FAILURE_BARRIER_REASON_COUNT,
    );
    return filteredReasonCounts;
  }
  const missingActiveNodeReason = resolvePublicationMissingActiveNodeReason(
    publicationConvergence,
  );
  if (!missingActiveNodeReason) {
    return reasonCounts;
  }
  const filteredReasonCounts = {};
  for (const [reason, count] of Object.entries(reasonCounts)) {
    const normalizedReason = normalizeActiveGateBlockerReason(reason);
    if (FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET.has(normalizedReason)) {
      continue;
    }
    addNormalizedReasonCount(filteredReasonCounts, normalizedReason, count);
  }
  addNormalizedReasonCount(
    filteredReasonCounts,
    missingActiveNodeReason,
    FAILURE_BARRIER_REASON_COUNT,
  );
  return filteredReasonCounts;
}

export function filterReasonCountsForClosedPublication({
  reasonCounts,
  publicationConvergence,
}) {
  if (
    !isRecord(reasonCounts) ||
    hasOpenPublicationOrPriorityRecoveryBlocker(publicationConvergence)
  ) {
    return reasonCounts;
  }
  const filteredReasonCounts = {};
  for (const [reason, count] of Object.entries(reasonCounts)) {
    if (FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET.has(reason)) {
      continue;
    }
    filteredReasonCounts[reason] = count;
  }
  return filteredReasonCounts;
}

export function hasReadyActiveGatePublicationConvergence(publicationConvergence) {
  if (!isRecord(publicationConvergence)) {
    return false;
  }
  if (publicationConvergence.activeGate?.ready === true) {
    return true;
  }
  const progress =
    publicationConvergence.activeGateProgress ||
    publicationConvergence.activeGate?.progress ||
    null;
  const expectedNodeCount = normalizeNonNegativeCount(
    progress?.expectedNodeCount,
  );
  const activeNodeCount = normalizeNonNegativeCount(progress?.activeNodeCount);
  const inactiveNodeCount = normalizeNonNegativeCount(
    progress?.inactiveNodeCount,
  );
  const gateReasonCount = normalizeNonNegativeCount(progress?.gateReasonCount);
  const pendingAckCount = normalizeNonNegativeCount(progress?.pendingAckCount);
  const missingPublishedCount = normalizeNonNegativeCount(
    progress?.missingPublishedCount,
  );
  return (
    expectedNodeCount !== null &&
    activeNodeCount !== null &&
    inactiveNodeCount !== null &&
    activeNodeCount >= expectedNodeCount &&
    inactiveNodeCount === ZERO &&
    progress?.snapshotCoverageComplete === true &&
    gateReasonCount === ZERO &&
    pendingAckCount === ZERO &&
    missingPublishedCount === ZERO
  );
}

export function hasClosedPostActiveConvergenceOwners(publicationConvergence) {
  return (
    hasReadyActiveGatePublicationConvergence(publicationConvergence) &&
    !hasOpenPublicationOrPriorityRecoveryBlocker(publicationConvergence)
  );
}

export function hasClosedPublicationConvergenceEvidence(publicationConvergence) {
  if (!isRecord(publicationConvergence)) {
    return false;
  }
  const publicationStatus = String(
    publicationConvergence.publicationStatus || '',
  ).trim();
  const publicationEpoch = normalizeNonNegativeCount(
    publicationConvergence.publicationEpoch,
  );
  return (
    (publicationStatus.length > ZERO || publicationEpoch !== null) &&
    !hasOpenPublicationOrPriorityRecoveryBlocker(publicationConvergence)
  );
}

export function hasConvergenceTimeoutError(entry) {
  return String(entry?.error || EMPTY_STRING).startsWith(
    FAILURE_BARRIER_ERROR_PREFIX_CONVERGENCE_TIMEOUT,
  );
}

export function hasRestartRecoveryTimeoutError(entry) {
  return String(entry?.error || EMPTY_STRING).startsWith(
    FAILURE_BARRIER_ERROR_PREFIX_RESTART_RECOVERY_TIMEOUT,
  );
}

export function normalizeRestartRecoveryReadinessFieldValue(value) {
  const normalizedValue = String(value ?? EMPTY_STRING).trim();
  if (normalizedValue === RESTART_RECOVERY_READINESS_BOOLEAN_TRUE) {
    return true;
  }
  if (normalizedValue === RESTART_RECOVERY_READINESS_BOOLEAN_FALSE) {
    return false;
  }
  if (
    normalizedValue === RESTART_RECOVERY_READINESS_NO_VALUE ||
    normalizedValue === RESTART_RECOVERY_READINESS_UNKNOWN_VALUE ||
    normalizedValue.length === ZERO
  ) {
    return null;
  }
  return normalizedValue;
}

export function normalizeRestartRecoveryReadinessNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.floor(numericValue) : null;
}

export function parseRestartRecoveryReadinessFieldMap(observationText) {
  const fields = {};
  for (const segment of observationText.split(
    RESTART_RECOVERY_READINESS_FIELD_SEPARATOR,
  )) {
    const separatorIndex = segment.indexOf(
      RESTART_RECOVERY_READINESS_FIELD_VALUE_SEPARATOR,
    );
    if (separatorIndex <= ZERO) {
      continue;
    }
    const fieldName = segment.slice(ZERO, separatorIndex).trim();
    const fieldValue = segment.slice(separatorIndex + 1).trim();
    if (fieldName.length > ZERO) {
      fields[fieldName] =
        normalizeRestartRecoveryReadinessFieldValue(fieldValue);
    }
  }
  return fields;
}

export function isRestartRecoveryAdminReachabilityRefused(lastError) {
  return String(lastError || EMPTY_STRING)
    .toLowerCase()
    .includes(RESTART_RECOVERY_READINESS_ADMIN_REFUSED_FRAGMENT);
}

export function resolveRestartRecoveryReadinessOwnerState(observation) {
  const evidence = Object.freeze({
    ready:
      observation?.ready === true ||
      observation?.adminReady === true ||
      observation?.controlPlaneRecoveryReady === true,
    adminRefused:
      observation?.adminReady !== true &&
      isRestartRecoveryAdminReachabilityRefused(observation?.lastError),
    bootstrapOnlyReachable:
      observation?.reachable === true &&
      observation?.reachableBy ===
        RESTART_RECOVERY_READINESS_REACHABLE_BY_BOOTSTRAP_HEALTH &&
      observation?.adminReady !== true &&
      observation?.controlPlaneRecoveryReady !== true,
  });
  if (evidence.ready) {
    return null;
  }
  if (evidence.adminRefused && evidence.bootstrapOnlyReachable) {
    return STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED;
  }
  return null;
}

export function resolveRestartRecoveryReadinessObservation(entry) {
  const errorMessage = String(entry?.error || '');
  if (!errorMessage.startsWith(
    FAILURE_BARRIER_ERROR_PREFIX_RESTART_RECOVERY_TIMEOUT,
  )) {
    return null;
  }
  const nodeMarkerIndex = errorMessage.indexOf(
    RESTART_RECOVERY_READINESS_NODE_MARKER,
  );
  const observationStartIndex = errorMessage.indexOf(
    RESTART_RECOVERY_READINESS_OBSERVATION_START_MARKER,
    nodeMarkerIndex,
  );
  const observationEndIndex = errorMessage.endsWith(
    RESTART_RECOVERY_READINESS_OBSERVATION_END_MARKER,
  ) ?
    errorMessage.length - RESTART_RECOVERY_READINESS_OBSERVATION_END_MARKER
      .length :
    -1;
  if (
    nodeMarkerIndex < ZERO ||
    observationStartIndex < ZERO ||
    observationEndIndex <= observationStartIndex
  ) {
    return null;
  }
  const nodeId = errorMessage.slice(
    nodeMarkerIndex + RESTART_RECOVERY_READINESS_NODE_MARKER.length,
    observationStartIndex,
  ).trim();
  const fieldMap = parseRestartRecoveryReadinessFieldMap(
    errorMessage.slice(
      observationStartIndex +
        RESTART_RECOVERY_READINESS_OBSERVATION_START_MARKER.length,
      observationEndIndex,
    ),
  );
  const observation = {
    nodeId: nodeId || null,
    reachable:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.REACHABLE] === true,
    ready:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.READY] === true,
    adminReady:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.ADMIN_READY] === true,
    controlPlaneRecoveryReady:
      fieldMap[
        RESTART_RECOVERY_READINESS_FIELD.CONTROL_PLANE_RECOVERY_READY
      ] === true,
    publishedControlPlaneEpoch:
      fieldMap[
        RESTART_RECOVERY_READINESS_FIELD.PUBLISHED_CONTROL_PLANE_EPOCH
      ],
    expectedPublicationEpoch:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.EXPECTED_PUBLICATION_EPOCH],
    readinessPhase:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.READINESS_PHASE],
    readinessStage:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.READINESS_STAGE],
    readinessStageRank: normalizeRestartRecoveryReadinessNumber(
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.READINESS_STAGE_RANK],
    ),
    readinessReasons:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.READINESS_REASONS],
    recoveryStage:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.RECOVERY_STAGE],
    bootstrapJoinProjectionBlocker:
      fieldMap[
        RESTART_RECOVERY_READINESS_FIELD.BOOTSTRAP_JOIN_PROJECTION_BLOCKER
      ],
    bootstrapJoinProjectionRule:
      fieldMap[
        RESTART_RECOVERY_READINESS_FIELD.BOOTSTRAP_JOIN_PROJECTION_RULE
      ],
    reachableBy:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.REACHABLE_BY],
    lastError:
      fieldMap[RESTART_RECOVERY_READINESS_FIELD.LAST_ERROR],
  };
  return Object.freeze({
    ...observation,
    ownerState: resolveRestartRecoveryReadinessOwnerState(observation),
  });
}

export function isSupersededFailureBarrierRootCause(rootCauseClass) {
  const normalizedRootCauseClass = String(rootCauseClass || '').trim();
  return FAILURE_BARRIER_SUPERSEDED_ROOT_CAUSE_CLASS_SET.has(
    normalizedRootCauseClass,
  );
}

export function isSupersededFailureBarrierReason(dominantReason) {
  const normalizedDominantReason = String(dominantReason || '').toLowerCase();
  return FAILURE_BARRIER_SUPERSEDED_REASON_FRAGMENT_SET.some((fragment) =>
    normalizedDominantReason.includes(fragment),
  );
}

export function shouldApplyConvergenceFailureBarrier({
  existingFailure,
  publicationConvergence,
}) {
  return (
    hasClosedPostActiveConvergenceOwners(publicationConvergence) ||
    hasClosedPublicationConvergenceEvidence(publicationConvergence) ||
    isSupersededFailureBarrierRootCause(existingFailure.rootCauseClass) ||
    isSupersededFailureBarrierReason(existingFailure.dominantReason)
  );
}

export function hasRestartRecoveryPrioritySpreadEvidence(publicationConvergence) {
  if (!hasOpenPublicationOrPriorityRecoveryBlocker(publicationConvergence)) {
    return false;
  }
  return (
    publicationConvergence?.prioritySpreadPending === true ||
    publicationConvergence?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING ||
    hasPrioritySpreadReasonCode(
      publicationConvergence?.priorityRecoveryReasonCodes,
      publicationConvergence?.reasonCodes,
      publicationConvergence?.reasons,
    )
  );
}

export function resolveRestartRecoveryFailureBarrierReason({
  existingFailure,
  publicationConvergence,
  terminalRecoveryReadiness,
}) {
  if (hasRestartRecoveryPrioritySpreadEvidence(publicationConvergence)) {
    return STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING;
  }
  if (
    terminalRecoveryReadiness?.ownerState ===
      STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED
  ) {
    return STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED;
  }
  if (isSupersededFailureBarrierReason(existingFailure.dominantReason)) {
    return STABILITY_GATE_BLOCKER_STARTUP_READINESS;
  }
  return FAILURE_BARRIER_REASON_RESTART_RECOVERY_TIMEOUT;
}

export function resolveRestartRecoveryFailureBarrierRootCauseClass(dominantReason) {
  if (dominantReason === STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  return ROOT_CAUSE_CLASS_STARTUP;
}

export function resolveRestartRecoveryFailureBarrier({
  entry,
  existingFailure,
  publicationConvergence,
}) {
  if (!hasRestartRecoveryTimeoutError(entry)) {
    return null;
  }
  const terminalRecoveryReadiness =
    resolveRestartRecoveryReadinessObservation(entry);
  const dominantReason = resolveRestartRecoveryFailureBarrierReason({
    existingFailure,
    publicationConvergence,
    terminalRecoveryReadiness,
  });
  return {
    phase: FAILURE_BARRIER_PHASE_RESTART_RECOVERY,
    dominantReason,
    rootCauseClass:
      resolveRestartRecoveryFailureBarrierRootCauseClass(dominantReason),
    ...(terminalRecoveryReadiness ? {terminalRecoveryReadiness} : {}),
  };
}

export function resolveConvergenceFailureBarrier({
  entry,
  existingFailure,
  publicationConvergence,
}) {
  if (
    !hasConvergenceTimeoutError(entry) ||
    !shouldApplyConvergenceFailureBarrier({
      existingFailure,
      publicationConvergence,
    })
  ) {
    return null;
  }
  return {
    phase: FAILURE_BARRIER_PHASE_CONVERGENCE,
    dominantReason: FAILURE_BARRIER_REASON_CONVERGENCE_TIMEOUT,
    rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
  };
}

export function resolveFailureBarrier({
  entry,
  existingFailure,
  publicationConvergence,
}) {
  return (
    resolveRestartRecoveryFailureBarrier({
      entry,
      existingFailure,
      publicationConvergence,
    }) ||
    resolveConvergenceFailureBarrier({
      entry,
      existingFailure,
      publicationConvergence,
    })
  );
}
