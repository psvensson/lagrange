import { classifyActiveGateClosureWitness } from "./active-gate-closure-classification.js";
import { STARTUP_READINESS_MODE_STARTUP } from "./startup-readiness-evidence.js";
import { buildPriorityRecoveryObservationSnapshot } from "../../../src/control-plane/priority-recovery-observation-snapshot.js";
import {
  buildPriorityRecoveryProgressSummary,
  normalizePriorityRecoveryPartitionWitnessesForDiagnostics,
} from "./priority-recovery-summary-normalization.js";
import { FAILURE_BUNDLE_SEGMENT_3 } from "./failure-bundle-segment-3.js";
const {
  FAILURE_BUNDLE_SCHEMA_VERSION,
  FAILURE_BUNDLE_RUN_DIRNAME,
  FAILURE_BUNDLE_JSON_FILENAME,
  FAILURE_BUNDLE_MARKDOWN_FILENAME,
  TRIAGE_SUMMARY_JSON_FILENAME,
  TRIAGE_SUMMARY_MARKDOWN_FILENAME,
  RUN_FAILURE_BUNDLE_JSON_FILENAME,
  RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME,
  LOG_FILE_EXTENSION,
  TIMELINE_FILENAME,
  ANALYSIS_FILENAME,
  UTF8_ENCODING,
  ZERO,
  LOG_TAIL_LINE_COUNT,
  MARKDOWN_SECTION_BREAK,
  UNKNOWN_VALUE,
  NO_PROGRESS_REASON_CODE,
  READINESS_FAILURE_CLASS_NO_PROGRESS,
  NODE_DIAGNOSTICS_TRACE_LIMIT,
  NODE_ID_ERROR_PATTERN,
  PLAYBACK_EVENTS_FILENAME,
  PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
  PLAYBACK_EVENT_TYPE_LOAD_STARTED,
  PLAYBACK_EVENT_TYPE_LOAD_PROGRESS,
  PLAYBACK_EVENT_TYPE_LOAD_COMPLETED,
  PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY,
  PLAYBACK_EVENT_TYPE_PARTITION_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_REMOVED,
  PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  ROOT_CAUSE_CLASS_UNKNOWN,
  ROOT_CAUSE_CLASS_STARTUP,
  ROOT_CAUSE_CLASS_DISCOVERY,
  ROOT_CAUSE_CLASS_TOPOLOGY,
  ROOT_CAUSE_CLASS_LOAD,
  ROOT_CAUSE_CLASS_CDC,
  ROOT_CAUSE_CLASS_CACHE,
  FIRST_FAULT_MARKER_QUEUE_PRESSURE,
  FIRST_FAULT_MARKER_ATTEMPT_ERRORS,
  FIRST_FAULT_MARKER_HARD_FAILURE,
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED,
  LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
  LOAD_WAIT_REASON_TIMEOUT_WAITS,
  LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED,
  READINESS_REASON_MAX_NODES,
  READINESS_REASON_MAX_PER_NODE,
  AFFECTED_NODE_ID_LIMIT,
  FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
  FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
  FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
  FAILURE_CLASS_TOPOLOGY_UNSTABLE,
  FAILURE_CLASS_LOAD_PRESSURE,
  FAILURE_CLASS_CDC_DEGRADED,
  FAILURE_CLASS_CACHE_STALE,
  FAILURE_CLASS_VERIFICATION_MISMATCH,
  FAILURE_CLASS_UNKNOWN,
  FAILURE_CLASS_CONFIDENCE_HIGH,
  FAILURE_CLASS_CONFIDENCE_MEDIUM,
  FAILURE_CLASS_CONFIDENCE_LOW,
  TRIAGE_CLUSTER_STAGE_LIMIT,
  TRIAGE_RECENT_TOPOLOGY_EVENT_LIMIT,
  TRIAGE_TOP_LOAD_NODE_LIMIT,
  STABILITY_GATE_STATUS_OPEN,
  STABILITY_GATE_STATUS_CLOSED,
  STABILITY_GATE_STATUS_NOT_APPLICABLE,
  STABILITY_GATE_STATUS_UNKNOWN,
  STABILITY_GATE_TYPE_FAILOVER,
  STABILITY_GATE_TYPE_CONVERGENCE,
  STABILITY_GATE_TYPE_RESTART_RECOVERY,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACK_NODES,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  SCENARIO_NAME_FRAGMENT_RESTART,
  LOAD_WAIT_REASON_KEYS,
  LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON,
  toWorkspaceRelative,
  sanitizePathSegment,
  sliceLogTail,
  parseStructuredLogLine,
  resolveStructuredLogMessage,
  resolveStructuredLogTimestamp,
  sanitizeStructuredDecisionArtifact,
  extractDecisionArtifactsFromLogContent,
  resolveRoutingDiagnostics,
  resolveFailureDiagnostics,
  addNormalizedReasonCount,
  buildPriorityRecoveryProgressDominantReason,
  deriveReasonCountsFromPublicationConvergence,
  isRecord,
  normalizeActiveGateReadinessDelay,
  appendActiveGateReadinessDelaySignals,
  appendReadinessFailureSignals,
  normalizeReadinessFailure,
  resolveReadinessFailure,
  resolveReadinessFailureGuidance,
  normalizeNonNegativeCount,
  resolveCanonicalFailedOperationCount,
  resolveFailureReasonCounts,
  buildTopReasonCounts,
  buildDominantReason,
  mergeReasonCounts,
  normalizeDistinctStringArray,
  buildPriorityRecoveryCorrelationKey,
  normalizePriorityRecoverySemanticStateId,
  inferPriorityRecoverySemanticState,
  normalizePriorityRecoveryDecisionSnapshots,
  mergePriorityRecoveryDecisionSnapshots,
  normalizePriorityRecoveryInvariants,
  mergePriorityRecoveryInvariants,
  summarizePriorityRecoveryDecisionSnapshots,
  deriveReasonCountsFromLoadMetrics,
  deriveReasonCountsFromReadiness,
  resolveRootCauseClassFromReason,
  resolveRootCauseClass,
  resolveSummaryRootCauseClass,
  normalizeAffectedNodeIds,
  buildMarker,
  resolveLoadMetricsFromPlaybackEvent,
  resolveLoadQueuePressureSignalCount,
  buildFirstFaultTimelineFromPlaybackEvents,
  buildPlaybackEventSummary,
  buildReadinessFromPlaybackEvents,
  cloneJsonValue,
  resolvePlaybackPublicationConvergence,
  resolvePlaybackPublishedMembershipObservation,
  scorePlaybackActiveGateDetails,
  buildPlaybackControlPlaneFallback,
  buildRestartBoundariesFromPlaybackEvents,
  collectPlaybackEventInsights,
  resolveReadinessSnapshot,
  resolveControlPlaneDiagnostics,
  mergeTransitionHistory,
  resolveControlSnapshot,
  resolveAdminQueryTraceByNodeId,
  resolveLoadMetrics,
  extractNodeIdsFromText,
  resolveRelevantNodeIds,
  resolveTraceFailureTimestampMs,
  toIsoTimestamp,
  resolveWorkflowRelevantNodeIds,
  resolveWorkflowStartTimestampMs,
  resolveWorkflowDeniedTimestampMs,
  resolveWorkflowFailureTimestampMs,
  buildNodeTimelineCorrelation,
  buildTimelineCorrelationByNodeId,
  collectScenarioLogArtifacts,
  mergeByNodeIdMaps,
} = FAILURE_BUNDLE_SEGMENT_3;

function resolvePriorityRecoveryObservation(controlPlane) {
  const priorityRecoveryObservation =
    controlPlane?.priorityRecoveryObservation &&
    typeof controlPlane.priorityRecoveryObservation === "object"
      ? controlPlane.priorityRecoveryObservation
      : null;
  if (priorityRecoveryObservation) {
    return priorityRecoveryObservation;
  }
  const publicationConvergence =
    controlPlane?.publicationConvergence &&
    typeof controlPlane.publicationConvergence === "object"
      ? controlPlane.publicationConvergence
      : null;
  const publicationConvergenceGate =
    controlPlane?.publicationConvergenceGate &&
    typeof controlPlane.publicationConvergenceGate === "object"
      ? controlPlane.publicationConvergenceGate
      : null;
  const priorityRecoveryDecisionSnapshots =
    controlPlane?.priorityRecoveryDecisionSnapshots &&
    typeof controlPlane.priorityRecoveryDecisionSnapshots === "object"
      ? controlPlane.priorityRecoveryDecisionSnapshots
      : null;
  const priorityRecoveryInvariants =
    controlPlane?.priorityRecoveryInvariants &&
    typeof controlPlane.priorityRecoveryInvariants === "object"
      ? controlPlane.priorityRecoveryInvariants
      : null;
  const activeGateProgress =
    controlPlane?.activeGateProgress &&
    typeof controlPlane.activeGateProgress === "object"
      ? controlPlane.activeGateProgress
      : null;
  const activeGateBestProgress =
    controlPlane?.activeGateBestProgress &&
    typeof controlPlane.activeGateBestProgress === "object"
      ? controlPlane.activeGateBestProgress
      : null;
  const activeGateNoProgress =
    controlPlane?.activeGateNoProgress &&
    typeof controlPlane.activeGateNoProgress === "object"
      ? controlPlane.activeGateNoProgress
      : null;
  const activeGateBlockerHistory = Array.isArray(
    controlPlane?.activeGateBlockerHistory,
  )
    ? controlPlane.activeGateBlockerHistory
    : null;
  const logsTable =
    controlPlane?.logsTable &&
    typeof controlPlane.logsTable === "object"
      ? controlPlane.logsTable
      : null;
  if (
    !publicationConvergence &&
    !publicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots &&
    !priorityRecoveryInvariants &&
    !activeGateProgress &&
    !activeGateBestProgress &&
    !activeGateNoProgress &&
    !activeGateBlockerHistory &&
    !logsTable
  ) {
    return null;
  }
  return buildPriorityRecoveryObservationSnapshot({
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryInvariants,
    activeGateProgress,
    activeGateBestProgress,
    activeGateNoProgress,
    activeGateBlockerHistory,
    logsTable,
  });
}

function attachPriorityRecoveryObservation(controlPlane) {
  if (!isRecord(controlPlane)) {
    return null;
  }
  const priorityRecoveryObservation =
    resolvePriorityRecoveryObservation(controlPlane);
  if (!priorityRecoveryObservation) {
    return controlPlane;
  }
  return {
    ...controlPlane,
    priorityRecoveryObservation,
  };
}

function mergeControlPlaneDiagnostics(primary, fallback) {
  const hasPrimary = isRecord(primary);
  const hasFallback = isRecord(fallback);
  if (!hasPrimary && !hasFallback) {
    return null;
  }
  if (!hasPrimary) {
    return attachPriorityRecoveryObservation({
      ...fallback,
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
    return attachPriorityRecoveryObservation({
      ...primary,
      priorityRecoveryDecisionSnapshots:
        normalizePriorityRecoveryDecisionSnapshots(
          primary?.priorityRecoveryDecisionSnapshots,
        ),
      priorityRecoveryInvariants: normalizePriorityRecoveryInvariants(
        primary?.priorityRecoveryInvariants,
      ),
    });
  }

  return attachPriorityRecoveryObservation({
    ...fallback,
    ...primary,
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
    activeGateProgress:
      primary.activeGateProgress || fallback.activeGateProgress || null,
    activeGateBestProgress:
      primary.activeGateBestProgress || fallback.activeGateBestProgress || null,
    activeGateNoProgress:
      primary.activeGateNoProgress || fallback.activeGateNoProgress || null,
    activeGateBlockerHistory:
      primary.activeGateBlockerHistory ||
      fallback.activeGateBlockerHistory ||
      null,
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

function mergeControlSnapshotByNodeId(primary, fallback) {
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

function buildFocusedNodeDiagnostics(
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
    typeof loadMetrics.perNode === "object" &&
    !Array.isArray(loadMetrics.perNode)
      ? loadMetrics.perNode
      : {};
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors)
    ? loadMetrics.distinctErrors
    : [];
  const failedPhaseErrors = Array.isArray(
    resolveFailureDiagnostics(entry)?.failedPhase?.errors,
  )
    ? resolveFailureDiagnostics(entry).failedPhase.errors
    : [];
  const errorTexts = [...failedPhaseErrors, ...distinctErrors];
  const controlSnapshotByNodeId = isRecord(mergedControlSnapshotByNodeId)
    ? mergedControlSnapshotByNodeId
    : resolveControlSnapshot(entry) || {};
  const adminQueryTraceByNodeId = resolveAdminQueryTraceByNodeId(entry) || {};
  const nodeDiagnostics = {};

  for (const nodeId of relevantNodeIds) {
    const matchingErrors = errorTexts.filter((errorText) =>
      extractNodeIdsFromText(errorText).includes(nodeId),
    );
    const traceEntries = Array.isArray(adminQueryTraceByNodeId[nodeId])
      ? adminQueryTraceByNodeId[nodeId].slice(-NODE_DIAGNOSTICS_TRACE_LIMIT)
      : [];
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
    )
      ? controlPlaneDiagnostics.readinessTransitionsByNodeId[nodeId]
      : [];
    const participationDecisions = Array.isArray(
      controlPlaneDiagnostics?.participationDecisions,
    )
      ? controlPlaneDiagnostics.participationDecisions.filter(
          (entry) => entry?.nodeId === nodeId,
        )
      : [];
    const authoritativeReadinessRepairs = Array.isArray(
      controlPlaneDiagnostics?.authoritativeReadinessRepairs,
    )
      ? controlPlaneDiagnostics.authoritativeReadinessRepairs.filter(
          (entry) => entry?.nodeId === nodeId,
        )
      : [];
    const recoveryEpochs = Array.isArray(
      controlPlaneDiagnostics?.recoveryEpochsByNodeId?.[nodeId],
    )
      ? controlPlaneDiagnostics.recoveryEpochsByNodeId[nodeId]
      : [];
    const controlPlaneOperations = Array.isArray(
      controlPlaneDiagnostics?.controlPlaneOperations,
    )
      ? controlPlaneDiagnostics.controlPlaneOperations.filter(
          (entry) => entry?.nodeId === nodeId,
        )
      : [];
    const timelineCorrelation = timelineCorrelationByNodeId?.[nodeId] || null;
    const nodeLogPath = logs?.nodeLogPaths?.[nodeId] || null;
    const logExcerpt = Array.isArray(logs?.excerptsByNodeId?.[nodeId])
      ? logs.excerptsByNodeId[nodeId]
      : [];
    const decisionArtifacts = logs?.decisionArtifactsByNodeId?.[nodeId] || null;
    const restartBoundaries = Array.isArray(
      logs?.restartBoundariesByNodeId?.[nodeId],
    )
      ? logs.restartBoundariesByNodeId[nodeId]
      : [];
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

function resolveFirstFaultTimeline(entry, fallbackTimeline = null) {
  const diagnostics = resolveFailureDiagnostics(entry);
  if (isRecord(diagnostics?.firstFaultTimeline)) {
    return diagnostics.firstFaultTimeline;
  }
  return isRecord(fallbackTimeline) ? fallbackTimeline : null;
}

function mapFirstFaultMarkerToReason(marker) {
  if (marker === FIRST_FAULT_MARKER_QUEUE_PRESSURE) {
    return LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE;
  }
  if (marker === FIRST_FAULT_MARKER_ATTEMPT_ERRORS) {
    return "attemptErrors";
  }
  if (marker === FIRST_FAULT_MARKER_HARD_FAILURE) {
    return "hardLoadFailures";
  }
  return null;
}

function resolveDominantReasonFromFirstFaultTimeline(firstFaultTimeline) {
  const orderedMarkers = Array.isArray(firstFaultTimeline?.orderedMarkers)
    ? firstFaultTimeline.orderedMarkers
    : [];
  if (orderedMarkers.length === ZERO) {
    return null;
  }
  return mapFirstFaultMarkerToReason(orderedMarkers[ZERO].marker);
}

function buildFailureArtifact({
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
  const reasonCounts = mergeReasonCounts(
    isRecord(existingFailure.reasonCounts)
      ? existingFailure.reasonCounts
      : null,
    loadReasonCounts,
    readinessReasonCounts,
    publicationConvergenceReasonCounts,
  );
  const timelineDominantReason =
    resolveDominantReasonFromFirstFaultTimeline(firstFaultTimeline);
  const progressDominantReason = buildPriorityRecoveryProgressDominantReason(
    publicationConvergence?.priorityRecoveryProgressSummary,
  );
  const dominantReason =
    typeof existingFailure.dominantReason === "string" &&
    existingFailure.dominantReason.length > ZERO
      ? existingFailure.dominantReason
      : progressDominantReason ||
        buildDominantReason(reasonCounts) ||
        timelineDominantReason ||
        null;
  if (dominantReason && !Object.hasOwn(reasonCounts, dominantReason)) {
    reasonCounts[dominantReason] = 1;
  }
  const rootCauseClass = resolveRootCauseClass({
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
    return null;
  }

  return {
    ...existingFailure,
    rootCauseClass,
    dominantReason,
    reasonCounts,
    affectedNodeIds,
  };
}

function buildPublicationConvergenceSummary(controlPlane) {
  const publicationConvergence =
    controlPlane?.publicationConvergence &&
    typeof controlPlane.publicationConvergence === "object"
      ? controlPlane.publicationConvergence
      : null;
  const publicationConvergenceGate =
    controlPlane?.publicationConvergenceGate &&
    typeof controlPlane.publicationConvergenceGate === "object"
      ? controlPlane.publicationConvergenceGate
      : null;
  const priorityRecoveryObservation =
    resolvePriorityRecoveryObservation(controlPlane);
  const hasActiveGatePublicationEvidence =
    (controlPlane?.publicationConvergenceGate &&
      typeof controlPlane.publicationConvergenceGate === "object") ||
    (controlPlane?.activeGateProgress &&
      typeof controlPlane.activeGateProgress === "object") ||
    (controlPlane?.activeGateBestProgress &&
      typeof controlPlane.activeGateBestProgress === "object") ||
    (controlPlane?.activeGateNoProgress &&
      typeof controlPlane.activeGateNoProgress === "object");
  if (
    !publicationConvergence &&
    !priorityRecoveryObservation &&
    !hasActiveGatePublicationEvidence
  ) {
    return null;
  }
  const blockedNodeIds = [];
  const blockingReasonCounts = {};
  for (const [nodeId, readiness] of Object.entries(
    controlPlane?.readinessByNodeId || {},
  )) {
    const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
    const reasonCodes = reasons
      .map((reason) => String(reason?.code || "").trim())
      .filter((reason) => reason.length > ZERO);
    const publicationReasons = reasonCodes.filter(
      (reason) =>
        reason === "control_plane_publication_pending" ||
        reason === "publishedConvergencePending" ||
        reason === "recovery_eligibility_pending",
    );
    if (publicationReasons.length === ZERO) {
      continue;
    }
    blockedNodeIds.push(nodeId);
    for (const reason of publicationReasons) {
      blockingReasonCounts[reason] = (blockingReasonCounts[reason] || ZERO) + 1;
    }
  }
  const pendingAckNodeIds = Array.isArray(
    priorityRecoveryObservation?.pendingAckNodeIds,
  )
    ? priorityRecoveryObservation.pendingAckNodeIds
    : [];
  const activeGateProgress =
    priorityRecoveryObservation?.activeGateProgress &&
    typeof priorityRecoveryObservation.activeGateProgress === "object"
      ? priorityRecoveryObservation.activeGateProgress
      : controlPlane?.activeGateProgress &&
          typeof controlPlane.activeGateProgress === "object"
        ? controlPlane.activeGateProgress
      : null;
  const activeGateSnapshotCoverage =
    controlPlane?.activeGateSnapshotCoverage &&
    typeof controlPlane.activeGateSnapshotCoverage === "object"
      ? controlPlane.activeGateSnapshotCoverage
      : null;
  const activeGateBestProgress =
    priorityRecoveryObservation?.activeGateBestProgress &&
    typeof priorityRecoveryObservation.activeGateBestProgress === "object"
      ? priorityRecoveryObservation.activeGateBestProgress
      : controlPlane?.activeGateBestProgress &&
          typeof controlPlane.activeGateBestProgress === "object"
        ? controlPlane.activeGateBestProgress
      : null;
  const activeGateNoProgress =
    priorityRecoveryObservation?.activeGateNoProgress &&
    typeof priorityRecoveryObservation.activeGateNoProgress === "object"
      ? priorityRecoveryObservation.activeGateNoProgress
      : controlPlane?.activeGateNoProgress &&
          typeof controlPlane.activeGateNoProgress === "object"
        ? controlPlane.activeGateNoProgress
      : null;
  const activeGateReadinessDelay = normalizeActiveGateReadinessDelay(
    activeGateNoProgress?.readinessDelay ||
      activeGateProgress?.readinessDelay ||
      activeGateBestProgress?.readinessDelay ||
      activeGateNoProgress?.currentProgress?.readinessDelay ||
      null,
  );
  const activeGateBlockerHistory = Array.isArray(
    priorityRecoveryObservation?.activeGateBlockerHistory,
  )
    ? priorityRecoveryObservation.activeGateBlockerHistory
    : Array.isArray(controlPlane?.activeGateBlockerHistory)
      ? controlPlane.activeGateBlockerHistory
    : [];
  const closureProgressSnapshot =
    activeGateProgress ||
    activeGateBestProgress ||
    activeGateNoProgress?.currentProgress ||
    (activeGateSnapshotCoverage
      ? {
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
            pendingAckNodeIds,
          )
            ? pendingAckNodeIds.length
            : ZERO,
          missingPublishedCount: Array.isArray(
            publicationConvergenceGate?.missingPublishedNodeIds,
          )
            ? publicationConvergenceGate.missingPublishedNodeIds.length
            : ZERO,
          recoveryProtocolState:
            priorityRecoveryObservation?.recoveryProtocolState || null,
          priorityRecoveryReasonCodes:
            priorityRecoveryObservation?.priorityRecoveryReasonCodes || [],
          gateReasons:
            priorityRecoveryObservation?.publicationConvergenceGateReasons ||
            [],
          prioritySpreadSatisfied:
            priorityRecoveryObservation?.priorityPartitionSummary?.satisfied ===
            true
              ? true
              : priorityRecoveryObservation?.priorityPartitionSummary
                    ?.satisfied === false
                ? false
                : null,
        }
      : null);
  const activeGateClosureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: closureProgressSnapshot,
    publicationConvergence,
    publicationConvergenceGate,
    readinessMode: activeGateNoProgress?.mode || null,
  });
  const priorityRecoveryPartitionWitnesses =
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
      priorityRecoveryObservation?.priorityRecoveryPartitionWitnesses,
    );
  const priorityRecoveryProgressSummary = buildPriorityRecoveryProgressSummary(
    priorityRecoveryObservation,
  );
  return {
    publicationEpoch:
      priorityRecoveryObservation?.publicationEpoch ??
      publicationConvergence?.publicationEpoch ??
      null,
    publicationStatus: priorityRecoveryObservation?.publicationStatus || null,
    pendingAckNodeIds,
    pendingAckCount:
      priorityRecoveryObservation?.pendingAckCount ?? pendingAckNodeIds.length,
    blockedNodeIds,
    blockedNodeCount: blockedNodeIds.length,
    blockingReasonCounts,
    publishedActiveNodeIds: Array.isArray(
      priorityRecoveryObservation?.publishedActiveNodeIds,
    )
      ? priorityRecoveryObservation.publishedActiveNodeIds
      : [],
    publishedAt: publicationConvergence?.publishedAt || null,
    updatedAt: publicationConvergence?.updatedAt || null,
    recoveryProtocolState:
      priorityRecoveryObservation?.recoveryProtocolState || null,
    priorityRecoveryReasonCodes:
      priorityRecoveryObservation?.priorityRecoveryReasonCodes || [],
    publicationPending:
      priorityRecoveryObservation?.publicationPending === true,
    prioritySpreadPending:
      priorityRecoveryObservation?.prioritySpreadPending === true,
    publicationConvergenceGateReasons:
      priorityRecoveryObservation?.publicationConvergenceGateReasons || [],
    activeGateProgress,
    activeGateBestProgress,
    activeGateNoProgress,
    activeGateReadinessDelay,
    activeGateBlockerHistory,
    closureRecordId:
      priorityRecoveryObservation?.closureRecordId ||
      activeGateClosureWitness?.closureRecordId ||
      null,
    closureWitnessClass:
      priorityRecoveryObservation?.closureWitnessClass ||
      activeGateClosureWitness?.closureWitnessClass ||
      null,
    projectionDiagnostics:
      priorityRecoveryObservation?.projectionDiagnostics || null,
    priorityPartitionSummary:
      priorityRecoveryObservation?.priorityPartitionSummary || null,
    priorityRecoveryProgressClassIds:
      priorityRecoveryObservation?.priorityRecoveryProgressClassIds || [],
    priorityRecoveryProgressClassCount:
      priorityRecoveryObservation?.priorityRecoveryProgressClassCount || ZERO,
    priorityRecoverySemanticStateIds:
      priorityRecoveryObservation?.priorityRecoverySemanticStateIds || [],
    priorityRecoverySemanticStateCount:
      priorityRecoveryObservation?.priorityRecoverySemanticStateCount || ZERO,
    priorityRecoveryBlockedPartitionIds:
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds || [],
    priorityRecoveryBlockedPartitionCount:
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionCount ||
      ZERO,
    priorityRecoveryUnresolvedPartitionIds:
      priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionIds || [],
    priorityRecoveryUnresolvedPartitionCount:
      priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionCount ||
      ZERO,
    priorityRecoveryBlockerPartitionIdsByReason:
      priorityRecoveryObservation?.priorityRecoveryBlockerPartitionIdsByReason ||
      {},
    priorityRecoveryPartitionIdsBySemanticState:
      priorityRecoveryObservation?.priorityRecoveryPartitionIdsBySemanticState ||
      {},
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

function collectReadinessReasonCodes(readinessSnapshot) {
  const reasons = Array.isArray(readinessSnapshot?.reasons)
    ? readinessSnapshot.reasons
    : [];
  return reasons
    .map((reason) => String(reason?.code || "").trim())
    .filter((reason) => reason.length > ZERO);
}

function buildRecoveryReadinessSummary({
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
      nodeDiagnostic?.routingDiagnostics?.routingReadinessDimension || "",
    ).trim();
    if (decisionDimension.length === ZERO) {
      continue;
    }
    routingDimensionCounts[decisionDimension] =
      (routingDimensionCounts[decisionDimension] || ZERO) + 1;
    if (decisionDimension === "repairEligible") {
      repairRoutedNodeIds.push(nodeId);
    } else if (decisionDimension === "controlPlaneRecoveryEligible") {
      recoveryRoutedNodeIds.push(nodeId);
    }
  }

  const recoveryOnlyNodeIds = [];
  const writeUnhealthyNodeIds = [];
  const publicationBlockedNodeIds = [];
  const readinessByNodeId =
    controlPlane?.readinessByNodeId &&
    typeof controlPlane.readinessByNodeId === "object"
      ? controlPlane.readinessByNodeId
      : {};

  for (const [nodeId, readiness] of Object.entries(readinessByNodeId)) {
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === "object"
        ? readiness.dimensions
        : {};
    const repairEligible = dimensions.repairEligible === true;
    const recoveryEligible = dimensions.controlPlaneRecoveryEligible === true;
    if (recoveryEligible && !repairEligible) {
      recoveryOnlyNodeIds.push(nodeId);
    }

    const reasonCodes = collectReadinessReasonCodes(readiness);
    if (reasonCodes.includes("control_plane_write_unhealthy")) {
      writeUnhealthyNodeIds.push(nodeId);
    }
    if (
      reasonCodes.includes("control_plane_publication_pending") ||
      reasonCodes.includes("publishedConvergencePending") ||
      reasonCodes.includes("recovery_eligibility_pending")
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
    typeof controlPlane.publicationConvergence === "object"
      ? controlPlane.publicationConvergence
      : null;
  const pendingAckNodeIds = Array.isArray(
    publicationConvergence?.pendingAckNodeIds,
  )
    ? publicationConvergence.pendingAckNodeIds
    : [];
  const pendingAckRecoveryOnlyNodeIds = [];
  const pendingAckRepairEligibleNodeIds = [];
  const pendingAckBlockedNodeIds = [];
  for (const nodeId of pendingAckNodeIds) {
    const readiness = readinessByNodeId[nodeId];
    if (!readiness || typeof readiness !== "object") {
      pendingAckBlockedNodeIds.push(nodeId);
      continue;
    }
    const dimensions =
      readiness.dimensions && typeof readiness.dimensions === "object"
        ? readiness.dimensions
        : {};
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

function buildStabilityGate({
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

function countRestartBoundaries(logs = null) {
  let restartBoundaryCount = ZERO;
  for (const boundaries of Object.values(
    logs?.restartBoundariesByNodeId || {},
  )) {
    restartBoundaryCount += Array.isArray(boundaries)
      ? boundaries.length
      : ZERO;
  }
  return restartBoundaryCount;
}

function buildConvergenceStabilityGate({
  publicationConvergence = null,
  readinessFailure = null,
  controlPlane = null,
}) {
  const hasStartupReadinessBlocker =
    readinessFailure?.mode === STARTUP_READINESS_MODE_STARTUP;
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
  if (publicationConvergence?.publicationPending === true) {
    blockers.push(STABILITY_GATE_BLOCKER_PUBLICATION_PENDING);
  }
  if (
    normalizeNonNegativeCount(publicationConvergence?.pendingAckCount) > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_PENDING_ACK_NODES);
  }
  if (
    normalizeNonNegativeCount(publicationConvergence?.blockedNodeCount) > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_BLOCKED_NODES);
  }
  if (publicationConvergence?.prioritySpreadPending === true) {
    blockers.push(STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING);
  }
  if (hasStartupReadinessBlocker) {
    blockers.push(STABILITY_GATE_BLOCKER_STARTUP_READINESS);
  }
  if (
    typeof publicationConvergence?.closureRecordId === "string" &&
    publicationConvergence.closureRecordId.length > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_CLOSURE_RECORD);
  }
  return buildStabilityGate({
    type: STABILITY_GATE_TYPE_CONVERGENCE,
    status:
      blockers.length > ZERO
        ? STABILITY_GATE_STATUS_OPEN
        : STABILITY_GATE_STATUS_CLOSED,
    blockers,
    evidence: {
      pendingAckCount: normalizeNonNegativeCount(
        publicationConvergence?.pendingAckCount,
      ),
      blockedNodeCount: normalizeNonNegativeCount(
        publicationConvergence?.blockedNodeCount,
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

function buildFailoverStabilityGate({
  publicationConvergence = null,
  readinessFailure = null,
  recoveryReadiness = null,
}) {
  const hasStartupReadinessBlocker =
    readinessFailure?.mode === STARTUP_READINESS_MODE_STARTUP;
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
  const pendingAckBlockedNodeCount = Array.isArray(
    recoveryReadiness?.pendingAckBlockedNodeIds,
  )
    ? recoveryReadiness.pendingAckBlockedNodeIds.length
    : ZERO;
  const publicationBlockedNodeCount = Array.isArray(
    recoveryReadiness?.publicationBlockedNodeIds,
  )
    ? recoveryReadiness.publicationBlockedNodeIds.length
    : ZERO;
  const writeUnhealthyNodeCount = Array.isArray(
    recoveryReadiness?.writeUnhealthyNodeIds,
  )
    ? recoveryReadiness.writeUnhealthyNodeIds.length
    : ZERO;
  if (publicationConvergence?.publicationPending === true) {
    blockers.push(STABILITY_GATE_BLOCKER_PUBLICATION_PENDING);
  }
  if (
    normalizeNonNegativeCount(publicationConvergence?.pendingAckCount) > ZERO ||
    pendingAckBlockedNodeCount > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_PENDING_ACK_NODES);
  }
  if (
    normalizeNonNegativeCount(publicationConvergence?.blockedNodeCount) >
      ZERO ||
    publicationBlockedNodeCount > ZERO ||
    writeUnhealthyNodeCount > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_BLOCKED_NODES);
  }
  if (hasStartupReadinessBlocker) {
    blockers.push(STABILITY_GATE_BLOCKER_STARTUP_READINESS);
  }
  return buildStabilityGate({
    type: STABILITY_GATE_TYPE_FAILOVER,
    status:
      blockers.length > ZERO
        ? STABILITY_GATE_STATUS_OPEN
        : STABILITY_GATE_STATUS_CLOSED,
    blockers,
    evidence: {
      pendingAckCount: normalizeNonNegativeCount(
        publicationConvergence?.pendingAckCount,
      ),
      blockedNodeCount: normalizeNonNegativeCount(
        publicationConvergence?.blockedNodeCount,
      ),
      pendingAckBlockedNodeCount,
      publicationBlockedNodeCount,
      writeUnhealthyNodeCount,
      readinessMode: readinessFailure?.mode || null,
    },
  });
}

export const FAILURE_BUNDLE_SEGMENT_4 = {
  FAILURE_BUNDLE_SCHEMA_VERSION,
  FAILURE_BUNDLE_RUN_DIRNAME,
  FAILURE_BUNDLE_JSON_FILENAME,
  FAILURE_BUNDLE_MARKDOWN_FILENAME,
  TRIAGE_SUMMARY_JSON_FILENAME,
  TRIAGE_SUMMARY_MARKDOWN_FILENAME,
  RUN_FAILURE_BUNDLE_JSON_FILENAME,
  RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME,
  LOG_FILE_EXTENSION,
  TIMELINE_FILENAME,
  ANALYSIS_FILENAME,
  UTF8_ENCODING,
  ZERO,
  LOG_TAIL_LINE_COUNT,
  MARKDOWN_SECTION_BREAK,
  UNKNOWN_VALUE,
  NO_PROGRESS_REASON_CODE,
  READINESS_FAILURE_CLASS_NO_PROGRESS,
  NODE_DIAGNOSTICS_TRACE_LIMIT,
  NODE_ID_ERROR_PATTERN,
  PLAYBACK_EVENTS_FILENAME,
  PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
  PLAYBACK_EVENT_TYPE_LOAD_STARTED,
  PLAYBACK_EVENT_TYPE_LOAD_PROGRESS,
  PLAYBACK_EVENT_TYPE_LOAD_COMPLETED,
  PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY,
  PLAYBACK_EVENT_TYPE_PARTITION_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_REMOVED,
  PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  ROOT_CAUSE_CLASS_UNKNOWN,
  ROOT_CAUSE_CLASS_STARTUP,
  ROOT_CAUSE_CLASS_DISCOVERY,
  ROOT_CAUSE_CLASS_TOPOLOGY,
  ROOT_CAUSE_CLASS_LOAD,
  ROOT_CAUSE_CLASS_CDC,
  ROOT_CAUSE_CLASS_CACHE,
  FIRST_FAULT_MARKER_QUEUE_PRESSURE,
  FIRST_FAULT_MARKER_ATTEMPT_ERRORS,
  FIRST_FAULT_MARKER_HARD_FAILURE,
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED,
  LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
  LOAD_WAIT_REASON_TIMEOUT_WAITS,
  LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED,
  READINESS_REASON_MAX_NODES,
  READINESS_REASON_MAX_PER_NODE,
  AFFECTED_NODE_ID_LIMIT,
  FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
  FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
  FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
  FAILURE_CLASS_TOPOLOGY_UNSTABLE,
  FAILURE_CLASS_LOAD_PRESSURE,
  FAILURE_CLASS_CDC_DEGRADED,
  FAILURE_CLASS_CACHE_STALE,
  FAILURE_CLASS_VERIFICATION_MISMATCH,
  FAILURE_CLASS_UNKNOWN,
  FAILURE_CLASS_CONFIDENCE_HIGH,
  FAILURE_CLASS_CONFIDENCE_MEDIUM,
  FAILURE_CLASS_CONFIDENCE_LOW,
  TRIAGE_CLUSTER_STAGE_LIMIT,
  TRIAGE_RECENT_TOPOLOGY_EVENT_LIMIT,
  TRIAGE_TOP_LOAD_NODE_LIMIT,
  STABILITY_GATE_STATUS_OPEN,
  STABILITY_GATE_STATUS_CLOSED,
  STABILITY_GATE_STATUS_NOT_APPLICABLE,
  STABILITY_GATE_STATUS_UNKNOWN,
  STABILITY_GATE_TYPE_FAILOVER,
  STABILITY_GATE_TYPE_CONVERGENCE,
  STABILITY_GATE_TYPE_RESTART_RECOVERY,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACK_NODES,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  SCENARIO_NAME_FRAGMENT_RESTART,
  LOAD_WAIT_REASON_KEYS,
  LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON,
  toWorkspaceRelative,
  sanitizePathSegment,
  sliceLogTail,
  parseStructuredLogLine,
  resolveStructuredLogMessage,
  resolveStructuredLogTimestamp,
  sanitizeStructuredDecisionArtifact,
  extractDecisionArtifactsFromLogContent,
  resolveRoutingDiagnostics,
  resolveFailureDiagnostics,
  addNormalizedReasonCount,
  deriveReasonCountsFromPublicationConvergence,
  isRecord,
  normalizeActiveGateReadinessDelay,
  appendActiveGateReadinessDelaySignals,
  appendReadinessFailureSignals,
  normalizeReadinessFailure,
  resolveReadinessFailure,
  resolveReadinessFailureGuidance,
  normalizeNonNegativeCount,
  resolveCanonicalFailedOperationCount,
  resolveFailureReasonCounts,
  buildTopReasonCounts,
  buildDominantReason,
  mergeReasonCounts,
  normalizeDistinctStringArray,
  buildPriorityRecoveryCorrelationKey,
  normalizePriorityRecoverySemanticStateId,
  inferPriorityRecoverySemanticState,
  normalizePriorityRecoveryDecisionSnapshots,
  mergePriorityRecoveryDecisionSnapshots,
  normalizePriorityRecoveryInvariants,
  mergePriorityRecoveryInvariants,
  summarizePriorityRecoveryDecisionSnapshots,
  deriveReasonCountsFromLoadMetrics,
  deriveReasonCountsFromReadiness,
  resolveRootCauseClassFromReason,
  resolveRootCauseClass,
  resolveSummaryRootCauseClass,
  normalizeAffectedNodeIds,
  buildMarker,
  resolveLoadMetricsFromPlaybackEvent,
  resolveLoadQueuePressureSignalCount,
  buildFirstFaultTimelineFromPlaybackEvents,
  buildPlaybackEventSummary,
  buildReadinessFromPlaybackEvents,
  cloneJsonValue,
  resolvePlaybackPublicationConvergence,
  resolvePlaybackPublishedMembershipObservation,
  scorePlaybackActiveGateDetails,
  buildPlaybackControlPlaneFallback,
  buildRestartBoundariesFromPlaybackEvents,
  collectPlaybackEventInsights,
  resolveReadinessSnapshot,
  resolveControlPlaneDiagnostics,
  mergeTransitionHistory,
  resolveControlSnapshot,
  resolveAdminQueryTraceByNodeId,
  resolveLoadMetrics,
  extractNodeIdsFromText,
  resolveRelevantNodeIds,
  resolveTraceFailureTimestampMs,
  toIsoTimestamp,
  resolveWorkflowRelevantNodeIds,
  resolveWorkflowStartTimestampMs,
  resolveWorkflowDeniedTimestampMs,
  resolveWorkflowFailureTimestampMs,
  buildNodeTimelineCorrelation,
  buildTimelineCorrelationByNodeId,
  collectScenarioLogArtifacts,
  mergeByNodeIdMaps,
  mergeControlPlaneDiagnostics,
  mergeControlSnapshotByNodeId,
  buildFocusedNodeDiagnostics,
  resolveFirstFaultTimeline,
  mapFirstFaultMarkerToReason,
  resolveDominantReasonFromFirstFaultTimeline,
  buildFailureArtifact,
  buildPublicationConvergenceSummary,
  collectReadinessReasonCodes,
  buildRecoveryReadinessSummary,
  buildStabilityGate,
  countRestartBoundaries,
  buildConvergenceStabilityGate,
  buildFailoverStabilityGate,
};
