import { FAILURE_BUNDLE_SEGMENT_4 } from "./failure-bundle-segment-4.js";
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
} = FAILURE_BUNDLE_SEGMENT_4;

function buildRestartRecoveryStabilityGate({
  entry,
  controlPlane = null,
  publicationConvergence = null,
  readinessFailure = null,
  logs = null,
}) {
  const scenarioName = String(entry?.scenario || "")
    .trim()
    .toLowerCase();
  const restartBoundaryCount = countRestartBoundaries(logs);
  const hasStartupReadinessBlocker =
    readinessFailure?.mode === STARTUP_READINESS_MODE_STARTUP;
  const startupRecovery = isRecord(controlPlane?.startupRecovery)
    ? controlPlane.startupRecovery
    : null;
  const applicable =
    scenarioName.includes(SCENARIO_NAME_FRAGMENT_RESTART) ||
    restartBoundaryCount > ZERO ||
    !!startupRecovery ||
    hasStartupReadinessBlocker;
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
  if (hasStartupReadinessBlocker || startupRecovery?.recoveryBlocked === true) {
    blockers.push(STABILITY_GATE_BLOCKER_STARTUP_READINESS);
  }
  if (
    typeof publicationConvergence?.closureRecordId === "string" &&
    publicationConvergence.closureRecordId.length > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_CLOSURE_RECORD);
  }
  return buildStabilityGate({
    type: STABILITY_GATE_TYPE_RESTART_RECOVERY,
    status:
      blockers.length > ZERO
        ? STABILITY_GATE_STATUS_OPEN
        : STABILITY_GATE_STATUS_CLOSED,
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
      prioritySpreadPending:
        publicationConvergence?.prioritySpreadPending === true,
      closureRecordId: publicationConvergence?.closureRecordId || null,
      closureWitnessClass: publicationConvergence?.closureWitnessClass || null,
      readinessMode: readinessFailure?.mode || null,
    },
  });
}

function buildStabilityGates({
  entry,
  controlPlane = null,
  publicationConvergence = null,
  readinessFailure = null,
  recoveryReadiness = null,
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
      logs,
    }),
  };
}

function buildFailureClassification({
  failure,
  controlPlane,
  readiness,
  logs,
}) {
  const signals = [];
  const dominantReason = String(failure?.dominantReason || "").trim();
  const rootCauseClass = String(failure?.rootCauseClass || "").trim();
  const publicationConvergence =
    buildPublicationConvergenceSummary(controlPlane);
  const readinessFailure = resolveReadinessFailure(controlPlane);
  const startupRecovery =
    controlPlane?.startupRecovery &&
    typeof controlPlane.startupRecovery === "object"
      ? controlPlane.startupRecovery
      : null;
  const latestStartupDecision =
    Object.values(logs?.decisionArtifactsByNodeId || {})
      .map((artifact) => artifact?.latestStartupDecision || null)
      .filter(Boolean)
      .slice(-1)[ZERO] || null;
  const hasStartupReadinessBlocker =
    readinessFailure?.mode === STARTUP_READINESS_MODE_STARTUP;

  if (
    publicationConvergence &&
    (publicationConvergence.pendingAckCount > ZERO ||
      publicationConvergence.blockedNodeCount > ZERO ||
      publicationConvergence.prioritySpreadPending === true ||
      hasStartupReadinessBlocker)
  ) {
    appendActiveGateReadinessDelaySignals(
      signals,
      publicationConvergence.activeGateReadinessDelay,
    );
    appendReadinessFailureSignals(signals, readinessFailure);
    signals.push(
      "pendingAckCount=" + publicationConvergence.pendingAckCount,
      "blockedNodeCount=" + publicationConvergence.blockedNodeCount,
    );
    if (
      typeof publicationConvergence.recoveryProtocolState === "string" &&
      publicationConvergence.recoveryProtocolState.length > ZERO
    ) {
      signals.push(
        "recoveryProtocolState=" + publicationConvergence.recoveryProtocolState,
      );
    }
    if (publicationConvergence.prioritySpreadPending === true) {
      signals.push("prioritySpreadPending=true");
    }
    if (
      Number(publicationConvergence.priorityRecoveryProgressClassCount) > ZERO
    ) {
      signals.push(
        "priorityRecoveryProgressClassCount=" +
          String(publicationConvergence.priorityRecoveryProgressClassCount),
      );
    }
    if (
      Array.isArray(
        publicationConvergence.priorityRecoveryInvariantFailingIds,
      ) &&
      publicationConvergence.priorityRecoveryInvariantFailingIds.length > ZERO
    ) {
      signals.push(
        "priorityRecoveryFailingInvariants=" +
          publicationConvergence.priorityRecoveryInvariantFailingIds.join("|"),
      );
    }
    if (
      typeof publicationConvergence.closureRecordId === "string" &&
      publicationConvergence.closureRecordId.length > ZERO
    ) {
      signals.push("closureRecordId=" + publicationConvergence.closureRecordId);
    }
    if (
      typeof publicationConvergence.closureWitnessClass === "string" &&
      publicationConvergence.closureWitnessClass.length > ZERO
    ) {
      signals.push(
        "closureWitnessClass=" + publicationConvergence.closureWitnessClass,
      );
    }
    return {
      failureClass: FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      confidence: FAILURE_CLASS_CONFIDENCE_HIGH,
      rootCauseClass:
        rootCauseClass && rootCauseClass !== ROOT_CAUSE_CLASS_UNKNOWN
          ? rootCauseClass
          : ROOT_CAUSE_CLASS_TOPOLOGY,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (
    startupRecovery?.recoveryBlocked === true ||
    rootCauseClass === ROOT_CAUSE_CLASS_STARTUP
  ) {
    if (startupRecovery?.recoveryStage) {
      signals.push("recoveryStage=" + startupRecovery.recoveryStage);
    }
    if (latestStartupDecision?.startupMode) {
      signals.push("startupMode=" + latestStartupDecision.startupMode);
    }
    return {
      failureClass: FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      confidence:
        startupRecovery?.recoveryBlocked === true
          ? FAILURE_CLASS_CONFIDENCE_HIGH
          : FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_STARTUP,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === ROOT_CAUSE_CLASS_DISCOVERY) {
    return {
      failureClass: FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === ROOT_CAUSE_CLASS_TOPOLOGY) {
    return {
      failureClass: FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === ROOT_CAUSE_CLASS_LOAD) {
    return {
      failureClass: FAILURE_CLASS_LOAD_PRESSURE,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (
    rootCauseClass === ROOT_CAUSE_CLASS_CDC ||
    dominantReason.includes("cdc")
  ) {
    return {
      failureClass: FAILURE_CLASS_CDC_DEGRADED,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_CDC,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (
    rootCauseClass === ROOT_CAUSE_CLASS_CACHE ||
    dominantReason.includes("cache")
  ) {
    return {
      failureClass: FAILURE_CLASS_CACHE_STALE,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_CACHE,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === "verify") {
    return {
      failureClass: FAILURE_CLASS_VERIFICATION_MISMATCH,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  const readinessReasons = Object.values(
    readiness?.nodeReasonsByNodeId || {},
  ).flatMap((reasons) => (Array.isArray(reasons) ? reasons : []));
  if (readinessReasons.length > ZERO) {
    signals.push(
      "readinessReasons=" + readinessReasons.slice(ZERO, 3).join("|"),
    );
  }

  return {
    failureClass: FAILURE_CLASS_UNKNOWN,
    confidence: FAILURE_CLASS_CONFIDENCE_LOW,
    rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_UNKNOWN,
    dominantReason: dominantReason || null,
    signals,
  };
}

function buildScenarioFailureBundle({
  entry,
  reportOutputPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  logs,
}) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const noProgress = diagnostics.noProgress || null;
  const controlPlane = mergeControlPlaneDiagnostics(
    resolveControlPlaneDiagnostics(entry),
    logs?.playbackControlPlane || null,
  );
  const controlSnapshotByNodeId = mergeControlSnapshotByNodeId(
    resolveControlSnapshot(entry),
    logs?.playbackControlSnapshotByNodeId || null,
  );
  const readiness = resolveReadinessSnapshot(
    entry,
    logs?.playbackReadiness || null,
  );
  const firstFaultTimeline = resolveFirstFaultTimeline(
    entry,
    logs?.firstFaultTimeline || null,
  );
  const readinessFailure = resolveReadinessFailure(controlPlane);
  const readinessFailureGuidance =
    resolveReadinessFailureGuidance(readinessFailure);
  const failure = buildFailureArtifact({
    entry,
    readiness,
    controlPlane,
    firstFaultTimeline,
  });
  const failureReasonCounts = resolveFailureReasonCounts(
    entry,
    failure?.reasonCounts || null,
  );
  const publicationConvergence =
    buildPublicationConvergenceSummary(controlPlane);
  const timelineCorrelationByNodeId = buildTimelineCorrelationByNodeId(
    entry,
    controlPlane,
  );
  const nodeDiagnostics = buildFocusedNodeDiagnostics(
    entry,
    logs,
    controlPlane,
    controlSnapshotByNodeId,
    timelineCorrelationByNodeId,
  );
  const recoveryReadiness = buildRecoveryReadinessSummary({
    controlPlane,
    nodeDiagnostics,
  });
  const stabilityGates = buildStabilityGates({
    entry,
    controlPlane,
    publicationConvergence,
    readinessFailure,
    recoveryReadiness,
    logs,
  });
  const failureClassification = buildFailureClassification({
    failure,
    controlPlane,
    readiness,
    logs,
  });
  const summaryRootCauseClass = resolveSummaryRootCauseClass(
    failure,
    failureClassification,
  );
  return {
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    reportPath: reportOutputPath,
    scenario: entry.scenario,
    summary: {
      passed: entry.passed === true,
      error: entry.error || null,
      phase: diagnostics?.failedPhase?.phase || null,
      rootCauseClass: summaryRootCauseClass,
      dominantReason: failure?.dominantReason || null,
      failureClassification,
      readinessFailure,
      failureAction: readinessFailureGuidance.failureAction,
      operatorRecommendation: readinessFailureGuidance.operatorRecommendation,
      publicationConvergence,
      stabilityGates,
      bottleneckEstimate: entry?.bottleneckEstimate || null,
    },
    reportSummary,
    standardSummary,
    benchmarkRegressionGate: benchmarkRegressionGate || null,
    diagnostics: {
      failure,
      failedPhase: diagnostics.failedPhase || null,
      noProgress,
      invariantBreaches:
        diagnostics.invariantBreaches || entry.invariantBreaches || null,
      controlPlaneDiagnostics:
        diagnostics.controlPlaneDiagnostics || controlPlane || null,
      priorityRecoveryDecisionSnapshots:
        controlPlane?.priorityRecoveryDecisionSnapshots || null,
      priorityRecoveryInvariants:
        controlPlane?.priorityRecoveryInvariants || null,
      rootCauseBundle: diagnostics.rootCauseBundle || null,
      firstFaultTimeline,
      recoveryReadiness,
    },
    controlSnapshot: controlSnapshotByNodeId,
    controlPlane,
    recoveryReadiness,
    publicationConvergence,
    readiness,
    topFailures: {
      reasonCounts: failureReasonCounts,
      topReasons: buildTopReasonCounts(failureReasonCounts),
      affectedNodeIds: Array.isArray(failure?.affectedNodeIds)
        ? failure.affectedNodeIds
        : [],
      loadMetrics: entry.loadMetrics || null,
    },
    nodeDiagnostics,
    logs,
    decisionArtifactsByNodeId: logs?.decisionArtifactsByNodeId || {},
    playback: entry.playback || null,
    trace: entry.trace || null,
    stabilityGates,
  };
}

function buildTriageLoadSummary(loadMetrics) {
  if (!isRecord(loadMetrics)) {
    return null;
  }
  const perNodeEntries = Object.entries(
    isRecord(loadMetrics.perNode) ? loadMetrics.perNode : {},
  )
    .map(([nodeId, metrics]) => ({
      nodeId,
      dispatched: normalizeNonNegativeCount(metrics?.dispatched) || ZERO,
      success: normalizeNonNegativeCount(metrics?.success) || ZERO,
      attemptErrors: normalizeNonNegativeCount(metrics?.attemptErrors) || ZERO,
      admissionSignals:
        normalizeNonNegativeCount(metrics?.admissionSignals) || ZERO,
      queuePressureSignals:
        normalizeNonNegativeCount(metrics?.queuePressureSignals) || ZERO,
    }))
    .sort((left, right) => right.attemptErrors - left.attemptErrors)
    .slice(ZERO, TRIAGE_TOP_LOAD_NODE_LIMIT);
  return {
    total: normalizeNonNegativeCount(loadMetrics.total),
    success: normalizeNonNegativeCount(loadMetrics.success),
    failed: normalizeNonNegativeCount(loadMetrics.failed),
    errors: normalizeNonNegativeCount(loadMetrics.errors),
    attemptErrors: normalizeNonNegativeCount(loadMetrics.attemptErrors),
    opsPerSec: Number.isFinite(Number(loadMetrics.opsPerSec))
      ? Number(loadMetrics.opsPerSec)
      : null,
    dispatchedOperations: normalizeNonNegativeCount(
      loadMetrics.dispatchedOperations,
    ),
    undispatchedOperations: normalizeNonNegativeCount(
      loadMetrics.undispatchedOperations,
    ),
    waitReasons: isRecord(loadMetrics.waitReasons)
      ? loadMetrics.waitReasons
      : {},
    perNodeTopAttemptErrors: perNodeEntries,
  };
}

function resolvePartitioningDiagnosticsForTriage(bundleJson) {
  const artifacts = isRecord(bundleJson?.diagnostics?.failedPhase?.artifacts)
    ? bundleJson.diagnostics.failedPhase.artifacts
    : {};
  const partitionGrowth = isRecord(artifacts.partitionGrowth)
    ? artifacts.partitionGrowth
    : null;
  const planner = isRecord(artifacts.partitioningPlanner)
    ? artifacts.partitioningPlanner
    : null;
  if (!partitionGrowth && !planner) {
    return null;
  }
  return {
    failureMode:
      typeof partitionGrowth?.failureMode === "string"
        ? partitionGrowth.failureMode
        : null,
    baselinePartitionCount: normalizeNonNegativeCount(
      partitionGrowth?.baselinePartitionCount,
    ),
    currentPartitionCount: normalizeNonNegativeCount(
      partitionGrowth?.currentPartitionCount,
    ),
    additionalPartitionCount: normalizeNonNegativeCount(
      partitionGrowth?.additionalPartitionCount,
    ),
    replicaNodeCount: normalizeNonNegativeCount(
      partitionGrowth?.replicaNodeCount,
    ),
    sampleCount: normalizeNonNegativeCount(partitionGrowth?.sampleCount),
    transientQueryErrors: normalizeNonNegativeCount(
      partitionGrowth?.transientQueryErrors,
    ),
    lastQueryError:
      typeof partitionGrowth?.lastQueryError === "string"
        ? partitionGrowth.lastQueryError
        : null,
    selectedNodeIds: normalizeDistinctStringArray(planner?.selectedNodeIds),
    readyReplicaNodeIds: normalizeDistinctStringArray(
      planner?.readyReplicaNodeIds,
    ),
    admissionReadyNodeIds: normalizeDistinctStringArray(
      planner?.admissionReadyNodeIds,
    ),
    localPrimaryNodeIds: normalizeDistinctStringArray(
      planner?.localPrimaryNodeIds,
    ),
    routedSupportNodeIds: normalizeDistinctStringArray(
      planner?.routedSupportNodeIds,
    ),
    readinessReasonHistogram: isRecord(planner?.readinessReasonHistogram)
      ? planner.readinessReasonHistogram
      : {},
    convergenceStateHistogram: isRecord(planner?.convergenceStateHistogram)
      ? planner.convergenceStateHistogram
      : {},
    dispatchContributionHistogram: isRecord(
      planner?.dispatchContributionHistogram,
    )
      ? planner.dispatchContributionHistogram
      : {},
    degradationStateHistogram: isRecord(planner?.degradationStateHistogram)
      ? planner.degradationStateHistogram
      : {},
    criticalControlPlaneStability: isRecord(
      planner?.criticalControlPlaneStability,
    )
      ? {
          state:
            typeof planner.criticalControlPlaneStability.state === "string"
              ? planner.criticalControlPlaneStability.state
              : null,
          reasonCodes: normalizeDistinctStringArray(
            planner.criticalControlPlaneStability.reasonCodes,
          ),
          retryAfterMs: normalizeNonNegativeCount(
            planner.criticalControlPlaneStability.retryAfterMs,
          ),
        }
      : null,
    convergenceEvaluations: Array.isArray(planner?.convergenceEvaluations)
      ? planner.convergenceEvaluations
          .filter((evaluation) => isRecord(evaluation))
          .map((evaluation) => ({
            nodeId:
              typeof evaluation.nodeId === "string" ? evaluation.nodeId : null,
            state:
              typeof evaluation.state === "string" ? evaluation.state : null,
            dispatchContributionState:
              typeof evaluation.dispatchContributionState === "string"
                ? evaluation.dispatchContributionState
                : null,
            localReplicaRole:
              typeof evaluation.localReplicaRole === "string"
                ? evaluation.localReplicaRole
                : null,
            localReplicaVoterReady: evaluation.localReplicaVoterReady === true,
            leadershipStable: evaluation.leadershipStable === true,
            admissionReady: evaluation.admissionReady === true,
            replicaBearing: evaluation.replicaBearing === true,
            degradationState:
              typeof evaluation.degradationState === "string"
                ? evaluation.degradationState
                : null,
            reasonCodes: normalizeDistinctStringArray(evaluation.reasonCodes),
            retryAfterMs: normalizeNonNegativeCount(evaluation.retryAfterMs),
          }))
      : [],
  };
}

function buildRoutingDiagnosticsSummary(nodeDiagnostics) {
  const summaryByNodeId = {};
  for (const [nodeId, diagnostic] of Object.entries(
    isRecord(nodeDiagnostics) ? nodeDiagnostics : {},
  )) {
    const routingDiagnostics = isRecord(diagnostic?.routingDiagnostics)
      ? diagnostic.routingDiagnostics
      : null;
    const timelineCorrelation = isRecord(diagnostic?.timelineCorrelation)
      ? diagnostic.timelineCorrelation
      : null;
    if (!routingDiagnostics && !timelineCorrelation) {
      continue;
    }
    summaryByNodeId[nodeId] = {
      routingDiagnostics,
      timelineCorrelation: timelineCorrelation
        ? {
            firstLoadFailureAt: timelineCorrelation.firstLoadFailureAt || null,
            firstSplitStartedAt:
              timelineCorrelation.firstSplitStartedAt || null,
            firstSplitRejectedAt:
              timelineCorrelation.firstSplitRejectedAt || null,
            firstSplitFailedAt: timelineCorrelation.firstSplitFailedAt || null,
          }
        : null,
    };
  }
  return Object.keys(summaryByNodeId).length > ZERO ? summaryByNodeId : null;
}

function buildScenarioTriageSummary(bundleJson, links = {}) {
  const readinessFailure =
    bundleJson?.summary?.readinessFailure &&
    typeof bundleJson.summary.readinessFailure === "object"
      ? bundleJson.summary.readinessFailure
      : null;
  return {
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    scenario: bundleJson?.scenario || UNKNOWN_VALUE,
    summary: {
      error: bundleJson?.summary?.error || null,
      phase: bundleJson?.summary?.phase || null,
      rootCauseClass: bundleJson?.summary?.rootCauseClass || null,
      dominantReason: bundleJson?.summary?.dominantReason || null,
      failureClass:
        bundleJson?.summary?.failureClassification?.failureClass || null,
      failureClassSignals: Array.isArray(
        bundleJson?.summary?.failureClassification?.signals,
      )
        ? bundleJson.summary.failureClassification.signals
        : [],
      readinessFailure,
      failureAction: bundleJson?.summary?.failureAction || null,
      operatorRecommendation:
        bundleJson?.summary?.operatorRecommendation || null,
      bottleneckKind: bundleJson?.summary?.bottleneckEstimate?.kind || null,
      stabilityGates: isRecord(bundleJson?.summary?.stabilityGates)
        ? bundleJson.summary.stabilityGates
        : isRecord(bundleJson?.stabilityGates)
          ? bundleJson.stabilityGates
          : null,
      affectedNodeIds: normalizeDistinctStringArray(
        bundleJson?.topFailures?.affectedNodeIds,
      ),
      topReasons: Array.isArray(bundleJson?.topFailures?.topReasons)
        ? bundleJson.topFailures.topReasons
        : [],
    },
    artifacts: {
      reportPath: bundleJson?.reportPath || null,
      analysisPath: bundleJson?.logs?.analysisPath || null,
      timelinePath: bundleJson?.logs?.timelinePath || null,
      playbackEventsPath: bundleJson?.logs?.playbackEventsPath || null,
      nodeLogPaths: isRecord(bundleJson?.logs?.nodeLogPaths)
        ? bundleJson.logs.nodeLogPaths
        : {},
      failureBundleJsonPath: links.jsonPath || null,
      failureBundleMarkdownPath: links.markdownPath || null,
    },
    load: buildTriageLoadSummary(bundleJson?.topFailures?.loadMetrics),
    playback: {
      firstFaultTimeline: isRecord(bundleJson?.diagnostics?.firstFaultTimeline)
        ? bundleJson.diagnostics.firstFaultTimeline
        : null,
      eventSummary: isRecord(bundleJson?.logs?.playbackEventSummary)
        ? bundleJson.logs.playbackEventSummary
        : null,
    },
    partitioning: resolvePartitioningDiagnosticsForTriage(bundleJson),
    routingDiagnosticsByNodeId: buildRoutingDiagnosticsSummary(
      bundleJson?.nodeDiagnostics,
    ),
    recoveryReadiness: isRecord(bundleJson?.recoveryReadiness)
      ? {
          pendingAckBlockedNodeIds: normalizeDistinctStringArray(
            bundleJson.recoveryReadiness.pendingAckBlockedNodeIds,
          ),
          routingDimensionCounts: isRecord(
            bundleJson.recoveryReadiness.routingDimensionCounts,
          )
            ? bundleJson.recoveryReadiness.routingDimensionCounts
            : {},
        }
      : null,
  };
}

function renderScenarioTriageSummaryMarkdown(summary) {
  const lines = [
    "# Scenario Triage Summary",
    "",
    `- Scenario: ${summary?.scenario || UNKNOWN_VALUE}`,
    `- Phase: ${summary?.summary?.phase || UNKNOWN_VALUE}`,
    `- Root Cause Class: ${summary?.summary?.rootCauseClass || UNKNOWN_VALUE}`,
    `- Dominant Reason: ${summary?.summary?.dominantReason || UNKNOWN_VALUE}`,
    `- Failure Class: ${summary?.summary?.failureClass || UNKNOWN_VALUE}`,
    `- Readiness Failure: ${formatReadinessFailure(summary?.summary?.readinessFailure)}`,
    `- Failure Class Signals: ${
      Array.isArray(summary?.summary?.failureClassSignals) &&
      summary.summary.failureClassSignals.length > ZERO
        ? summary.summary.failureClassSignals.join("|")
        : UNKNOWN_VALUE
    }`,
    `- Failure Action: ${summary?.summary?.failureAction || UNKNOWN_VALUE}`,
    `- Operator Recommendation: ${
      summary?.summary?.operatorRecommendation || UNKNOWN_VALUE
    }`,
    `- Bottleneck: ${summary?.summary?.bottleneckKind || UNKNOWN_VALUE}`,
  ];

  lines.push("", "## Stability Gates", "");
  lines.push(formatStabilityGateSummary(summary?.summary?.stabilityGates));

  lines.push(
    "",
    "## Artifact Paths",
    "",
    `- Report: ${summary?.artifacts?.reportPath || UNKNOWN_VALUE}`,
    `- Failure Bundle JSON: ${summary?.artifacts?.failureBundleJsonPath || UNKNOWN_VALUE}`,
    `- Failure Bundle Markdown: ${summary?.artifacts?.failureBundleMarkdownPath || UNKNOWN_VALUE}`,
    `- Playback Events: ${summary?.artifacts?.playbackEventsPath || UNKNOWN_VALUE}`,
    `- Timeline: ${summary?.artifacts?.timelinePath || UNKNOWN_VALUE}`,
    `- Analysis: ${summary?.artifacts?.analysisPath || UNKNOWN_VALUE}`,
  );

  const topReasons = Array.isArray(summary?.summary?.topReasons)
    ? summary.summary.topReasons
    : [];
  lines.push("", "## Top Reasons", "");
  if (topReasons.length === ZERO) {
    lines.push("- none");
  } else {
    for (const reason of topReasons) {
      lines.push(
        `- ${String(reason?.reason || UNKNOWN_VALUE)}: ` +
          `${String(reason?.count ?? UNKNOWN_VALUE)}`,
      );
    }
  }

  const playbackEventSummary = summary?.playback?.eventSummary || null;
  lines.push("", "## Playback", "");
  lines.push(
    `- Load Started: ${playbackEventSummary?.load?.startedAt || UNKNOWN_VALUE}`,
  );
  lines.push(
    `- Load Completed: ${playbackEventSummary?.load?.completedAt || UNKNOWN_VALUE}`,
  );
  lines.push(
    `- Load Progress Events: ${String(playbackEventSummary?.load?.progressEventCount ?? UNKNOWN_VALUE)}`,
  );
  lines.push(
    `- Partition Created Events: ${String(playbackEventSummary?.topology?.partitionCreatedCount ?? UNKNOWN_VALUE)}`,
  );
  lines.push(
    `- Replica Created Events: ${String(playbackEventSummary?.topology?.replicaCreatedCount ?? UNKNOWN_VALUE)}`,
  );
  lines.push(
    `- Replica Removed Events: ${String(playbackEventSummary?.topology?.replicaRemovedCount ?? UNKNOWN_VALUE)}`,
  );

  const partitioning = summary?.partitioning || null;
  if (partitioning) {
    lines.push("", "## Partitioning", "");
    lines.push(`- Failure Mode: ${partitioning.failureMode || UNKNOWN_VALUE}`);
    lines.push(
      `- Baseline -> Current Partitions: ` +
        `${String(partitioning.baselinePartitionCount ?? UNKNOWN_VALUE)} -> ` +
        `${String(partitioning.currentPartitionCount ?? UNKNOWN_VALUE)}`,
    );
    lines.push(
      `- Additional Partitions Seen: ` +
        `${String(partitioning.additionalPartitionCount ?? UNKNOWN_VALUE)}`,
    );
    lines.push(
      `- Replica Spread Nodes: ${String(partitioning.replicaNodeCount ?? UNKNOWN_VALUE)}`,
    );
    lines.push(
      `- Selected Nodes: ${
        partitioning.selectedNodeIds?.join(", ") || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Ready Replica Nodes: ${
        partitioning.readyReplicaNodeIds?.join(", ") || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Admission-Ready Nodes: ${
        partitioning.admissionReadyNodeIds?.join(", ") || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Local Primary Nodes: ${
        partitioning.localPrimaryNodeIds?.join(", ") || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Routed Support Nodes: ${
        partitioning.routedSupportNodeIds?.join(", ") || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Readiness Histogram: ${formatCountEntries(
        partitioning.readinessReasonHistogram,
      )}`,
    );
    lines.push(
      `- Convergence Histogram: ${formatCountEntries(
        partitioning.convergenceStateHistogram,
      )}`,
    );
    lines.push(
      `- Dispatch Contribution Histogram: ${formatCountEntries(
        partitioning.dispatchContributionHistogram,
      )}`,
    );
    lines.push(
      `- Degradation Histogram: ${formatCountEntries(
        partitioning.degradationStateHistogram,
      )}`,
    );
    lines.push(
      `- Critical Control-Plane State: ${
        partitioning.criticalControlPlaneStability?.state || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Critical Control-Plane Reasons: ${
        partitioning.criticalControlPlaneStability?.reasonCodes?.join(", ") ||
        UNKNOWN_VALUE
      }`,
    );
    lines.push("- Convergence Evaluations:");
    lines.push(
      formatPartitioningConvergenceEvaluations(
        partitioning.convergenceEvaluations,
      ),
    );
  }

  const routingDiagnosticsByNodeId = isRecord(
    summary?.routingDiagnosticsByNodeId,
  )
    ? summary.routingDiagnosticsByNodeId
    : {};
  lines.push("", "## Routing Diagnostics", "");
  if (Object.keys(routingDiagnosticsByNodeId).length === ZERO) {
    lines.push("- none");
  } else {
    for (const [nodeId, entry] of Object.entries(routingDiagnosticsByNodeId)) {
      lines.push(
        `- ${nodeId}: reason=${String(entry?.routingDiagnostics?.reasonCode || UNKNOWN_VALUE)}, ` +
          `services=${String(entry?.routingDiagnostics?.serviceRowCount ?? UNKNOWN_VALUE)}, ` +
          `routable=${String(entry?.routingDiagnostics?.routableServiceCount ?? UNKNOWN_VALUE)}, ` +
          `leader=${String(entry?.routingDiagnostics?.canonicalLeaderNodeId || UNKNOWN_VALUE)}`,
      );
    }
  }

  return lines.join("\n") + "\n";
}

function formatList(values) {
  const items = Array.isArray(values)
    ? values
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > ZERO)
    : [];
  return items.length > ZERO ? items.join(", ") : UNKNOWN_VALUE;
}

function formatCountEntries(entries) {
  if (!entries || typeof entries !== "object") {
    return UNKNOWN_VALUE;
  }
  const rendered = Object.entries(entries)
    .map(([key, count]) => `${key}:${String(count ?? ZERO)}`)
    .filter((entry) => entry.length > ZERO);
  return rendered.length > ZERO ? rendered.join(", ") : UNKNOWN_VALUE;
}

function formatPartitioningConvergenceEvaluations(evaluations) {
  const rendered = (Array.isArray(evaluations) ? evaluations : [])
    .filter((evaluation) => isRecord(evaluation))
    .map((evaluation) => {
      const nodeId = String(evaluation.nodeId || "").trim();
      if (nodeId.length === ZERO) {
        return null;
      }
      const reasonCodes = normalizeDistinctStringArray(evaluation.reasonCodes);
      return [
        nodeId,
        "state=" + String(evaluation.state || UNKNOWN_VALUE),
        "dispatch=" +
          String(evaluation.dispatchContributionState || UNKNOWN_VALUE),
        "role=" + String(evaluation.localReplicaRole || UNKNOWN_VALUE),
        "voterReady=" + String(evaluation.localReplicaVoterReady === true),
        "leaderStable=" + String(evaluation.leadershipStable === true),
        "replicaBearing=" + String(evaluation.replicaBearing === true),
        "admissionReady=" + String(evaluation.admissionReady === true),
        "degradation=" + String(evaluation.degradationState || UNKNOWN_VALUE),
        "reasons=" +
          (reasonCodes.length > ZERO ? reasonCodes.join("|") : UNKNOWN_VALUE),
        "retryAfterMs=" + String(evaluation.retryAfterMs ?? UNKNOWN_VALUE),
      ].join(", ");
    })
    .filter(Boolean);
  return rendered.length > ZERO ? rendered.join("\n") : "- none";
}

function formatStabilityGate(gate) {
  if (!isRecord(gate)) {
    return UNKNOWN_VALUE;
  }
  const parts = ["status=" + String(gate.status || UNKNOWN_VALUE)];
  const blockers = normalizeDistinctStringArray(gate.blockers);
  if (blockers.length > ZERO) {
    parts.push("blockers=" + blockers.join("|"));
  }
  const closureRecordId = String(gate?.evidence?.closureRecordId || "").trim();
  if (closureRecordId.length > ZERO) {
    parts.push("closureRecordId=" + closureRecordId);
  }
  const restartBoundaryCount = normalizeNonNegativeCount(
    gate?.evidence?.restartBoundaryCount,
  );
  if (restartBoundaryCount !== null) {
    parts.push("restartBoundaryCount=" + String(restartBoundaryCount));
  }
  const pendingAckCount = normalizeNonNegativeCount(
    gate?.evidence?.pendingAckCount,
  );
  if (pendingAckCount !== null) {
    parts.push("pendingAckCount=" + String(pendingAckCount));
  }
  const blockedNodeCount = normalizeNonNegativeCount(
    gate?.evidence?.blockedNodeCount,
  );
  if (blockedNodeCount !== null) {
    parts.push("blockedNodeCount=" + String(blockedNodeCount));
  }
  return parts.join(", ");
}

function formatStabilityGateSummary(stabilityGates) {
  const entries = Object.values(
    isRecord(stabilityGates) ? stabilityGates : {},
  ).filter((gate) => isRecord(gate));
  if (entries.length === ZERO) {
    return "- none";
  }
  return entries
    .map(
      (gate) =>
        `- ${String(gate.type || UNKNOWN_VALUE)}: ${formatStabilityGate(gate)}`,
    )
    .join("\n");
}

function formatReasonPartitionEntries(entriesByReason) {
  if (!entriesByReason || typeof entriesByReason !== "object") {
    return UNKNOWN_VALUE;
  }
  const rendered = Object.entries(entriesByReason)
    .map(([reason, partitionIds]) => {
      const normalizedReason = String(reason || "").trim();
      if (normalizedReason.length === ZERO) {
        return null;
      }
      const normalizedPartitionIds = normalizeDistinctStringArray(partitionIds);
      return (
        normalizedReason +
        ":" +
        (normalizedPartitionIds.length > ZERO
          ? normalizedPartitionIds.join("|")
          : UNKNOWN_VALUE)
      );
    })
    .filter((entry) => entry !== null);
  return rendered.length > ZERO ? rendered.join(", ") : UNKNOWN_VALUE;
}

function formatPriorityRecoveryInvariantFailures(failures) {
  const normalizedFailures = Array.isArray(failures) ? failures : [];
  if (normalizedFailures.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return normalizedFailures
    .map((failure) =>
      String(failure?.id || PRIORITY_RECOVERY_INVARIANT_FALLBACK),
    )
    .join(", ");
}

export const FAILURE_BUNDLE_SEGMENT_5 = {
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
  buildRestartRecoveryStabilityGate,
  buildStabilityGates,
  buildFailureClassification,
  buildScenarioFailureBundle,
  buildTriageLoadSummary,
  resolvePartitioningDiagnosticsForTriage,
  buildRoutingDiagnosticsSummary,
  buildScenarioTriageSummary,
  renderScenarioTriageSummaryMarkdown,
  formatList,
  formatCountEntries,
  formatPartitioningConvergenceEvaluations,
  formatStabilityGate,
  formatStabilityGateSummary,
  formatReasonPartitionEntries,
  formatPriorityRecoveryInvariantFailures,
};
