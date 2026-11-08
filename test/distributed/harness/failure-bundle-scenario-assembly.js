import {FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT} from './failure-bundle-diagnostics-contract-reexport.js';
import {
  LOG_WINDOW_COVERAGE,
  formatLogWindowCoverageVerdict,
} from './failure-bundle-artifact-foundation.js';
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
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
  SCENARIO_NAME_FRAGMENT_RESTART,
  LOAD_WAIT_REASON_KEYS,
  LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON,
  toWorkspaceRelative,
  sanitizePathSegment,
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
} = FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT;

import {
  buildRestartRecoveryStabilityGate,
  buildStabilityGates,
} from './failure-bundle-stability-gates.js';
import {
  buildFailureClassification,
  resolveFailureClassificationGuidance,
  resolvePostRebalanceClosure,
} from './failure-bundle-failure-classification.js';
import {
  buildRoutingDiagnosticsSummary,
  buildScenarioTriageSummary,
  buildTriageLoadSummary,
  formatCountEntries,
  formatList,
  formatObservedList,
  formatPartitioningConvergenceEvaluations,
  formatPriorityRecoveryInvariantFailures,
  formatProjectionDiagnostics,
  formatReasonPartitionEntries,
  formatStabilityGate,
  formatStabilityGateSummary,
  renderScenarioTriageSummaryMarkdown,
  resolvePartitioningDiagnosticsForTriage,
} from './failure-bundle-triage-summary.js';

const LOAD_METRICS_SOURCE_SCENARIO = 'scenario';
const LOAD_METRICS_SOURCE_PLAYBACK = 'playback';
const LOAD_METRICS_SOURCE_ABSENT = 'absent';
const LOAD_METRICS_COMPLETENESS_SCENARIO = 'scenario_metrics';
const LOAD_METRICS_COMPLETENESS_PLAYBACK_COMPLETED = 'playback_completed';
const LOAD_METRICS_COMPLETENESS_PLAYBACK_LAST_OBSERVED =
  'playback_last_observed';
const LOAD_METRICS_COMPLETENESS_ABSENT = 'absent';

function collectPositiveWaitReasons(loadMetrics, reasonKeys) {
  const waitReasons = isRecord(loadMetrics?.waitReasons) ?
    loadMetrics.waitReasons :
    {};
  const positiveReasons = {};
  for (const reasonKey of reasonKeys) {
    const count = normalizeNonNegativeCount(waitReasons[reasonKey]) || ZERO;
    if (count > ZERO) {
      positiveReasons[reasonKey] = count;
    }
  }
  return positiveReasons;
}

function resolveLoadMetricsSelection(entryLoadMetrics, logs) {
  const playbackLoadSummary = isRecord(logs?.playbackEventSummary?.load) ?
    logs.playbackEventSummary.load :
    {};
  const playbackMetrics = isRecord(playbackLoadSummary.lastMetrics) ?
    playbackLoadSummary.lastMetrics :
    null;
  const playbackCompleted =
    playbackLoadSummary.completedAtMs !== null &&
    playbackLoadSummary.completedAtMs !== undefined &&
    Number.isFinite(Number(playbackLoadSummary.completedAtMs));
  const progressEventCount =
    normalizeNonNegativeCount(playbackLoadSummary.progressEventCount) || ZERO;
  const entryMetricsAvailable = isRecord(entryLoadMetrics);
  const playbackMetricsAvailable = isRecord(playbackMetrics);

  let metrics = null;
  let source = LOAD_METRICS_SOURCE_ABSENT;
  let completeness = LOAD_METRICS_COMPLETENESS_ABSENT;
  if (entryMetricsAvailable) {
    metrics = entryLoadMetrics;
    source = LOAD_METRICS_SOURCE_SCENARIO;
    completeness = LOAD_METRICS_COMPLETENESS_SCENARIO;
  } else if (playbackMetricsAvailable) {
    metrics = playbackMetrics;
    source = LOAD_METRICS_SOURCE_PLAYBACK;
    completeness = playbackCompleted ?
      LOAD_METRICS_COMPLETENESS_PLAYBACK_COMPLETED :
      LOAD_METRICS_COMPLETENESS_PLAYBACK_LAST_OBSERVED;
  }

  return {
    metrics,
    provenance: {
      source,
      completeness,
      playbackCompleted,
      playbackProgressEventCount: progressEventCount,
      pressureWaitReasons: collectPositiveWaitReasons(metrics, [
        LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED,
        LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
        LOAD_WAIT_REASON_TIMEOUT_WAITS,
        LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED,
      ]),
      nodeSlotUnavailable:
        collectPositiveWaitReasons(metrics, [
          LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
        ])[LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE] || ZERO,
    },
  };
}

// The failed phase a phase-orchestrated scenario reports, else the
// scenario step its own step log (scenario.step events) recorded as
// failed; never "unknown" when the scenario named the step.
function resolveSummaryPhase(diagnostics, logs) {
  const reportedPhase = diagnostics?.failedPhase?.phase;
  if (reportedPhase) {
    return reportedPhase;
  }
  return logs?.playbackEventSummary?.failedScenarioStep?.step || null;
}

// Incomplete analysis fails the subject: when any node's retained log window
// misses part of the failure window (or the capture owner judged the capture
// incomplete, or no node log could be examined), the bundle is published
// non-measuring. This is the one function that decides what such a bundle
// publishes: it keeps the evidence it gathered, publishes
// LOG_WINDOW_COVERAGE.WITHHELD in place of every verdict field derived from
// that evidence (summary and diagnostics.failure dominant reason, root cause
// class, failure classification, first-fault reason, and the root-cause
// bundle's rootCauseCode/rootCauseClass, so the artifact never carries a
// second root-cause answer beside the withheld one), empties the reason
// ranking, and names the withheld bytes instead (validation-matrix.js turns
// the coverage into the verdict; the scenario entry copies these fields).
const WITHHELD = LOG_WINDOW_COVERAGE.WITHHELD;
const WITHHELD_FAILURE_CLASSIFICATION = Object.freeze({
  failureClass: WITHHELD,
  rootCauseClass: WITHHELD,
  dominantReason: WITHHELD,
  signals: Object.freeze([]),
});

function withholdFailureArtifact(failure) {
  if (!isRecord(failure)) {
    return failure;
  }
  return {
    ...failure,
    rootCauseClass: WITHHELD,
    dominantReason: WITHHELD,
    reasonCounts: {},
    ...(isRecord(failure.firstFault) ?
      {firstFault: {...failure.firstFault, reason: WITHHELD}} :
      {}),
  };
}

// logWindowCoverage is null only on the passing path, which retains no
// windows and publishes no verdict (writers attachPassingScenario...).
function withholdRootCauseBundle(rootCauseBundle) {
  return isRecord(rootCauseBundle) ?
    {...rootCauseBundle, rootCauseCode: WITHHELD, rootCauseClass: WITHHELD} :
    rootCauseBundle;
}

function withholdVerdictForIncompleteCoverage(bundle, logWindowCoverage) {
  if (logWindowCoverage === null || logWindowCoverage.complete === true) {
    return bundle;
  }
  const withheld = formatLogWindowCoverageVerdict(logWindowCoverage);
  return {
    ...bundle,
    summary: {
      ...bundle.summary,
      rootCauseClass: WITHHELD,
      dominantReason: WITHHELD,
      failureClassification: {...WITHHELD_FAILURE_CLASSIFICATION, signals: []},
      failureAction:
        `${LOG_WINDOW_COVERAGE.INCOMPLETE_GUIDANCE.failureAction} ` +
        `Coverage: ${withheld}.`,
      operatorRecommendation:
        LOG_WINDOW_COVERAGE.INCOMPLETE_GUIDANCE.operatorRecommendation,
    },
    diagnostics: {
      ...bundle.diagnostics,
      failure: withholdFailureArtifact(bundle.diagnostics.failure),
      rootCauseBundle: withholdRootCauseBundle(bundle.diagnostics.rootCauseBundle),
    },
    topFailures: {
      ...bundle.topFailures,
      reasonCounts: {},
      topReasons: [],
    },
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
  const postRebalanceClosure = resolvePostRebalanceClosure(diagnostics);
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
  const entryLoadMetrics = resolveLoadMetrics(entry);
  const loadMetricsSelection = resolveLoadMetricsSelection(
    entryLoadMetrics,
    logs,
  );
  const selectedLoadMetrics = loadMetricsSelection.metrics;
  const loadMetricsFallback =
    loadMetricsSelection.provenance.source === LOAD_METRICS_SOURCE_PLAYBACK ?
      selectedLoadMetrics :
      null;
  const readinessFailure = resolveReadinessFailure(controlPlane);
  const readinessFailureGuidance =
    resolveReadinessFailureGuidance(readinessFailure);
  const failure = buildFailureArtifact({
    entry,
    readiness,
    controlPlane,
    firstFaultTimeline,
    loadMetricsFallback,
  });
  const failureReasonCounts =
    !entryLoadMetrics && loadMetricsFallback && isRecord(failure?.reasonCounts) ?
      failure.reasonCounts :
      resolveFailureReasonCounts(entry, failure?.reasonCounts || null);
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
    failure,
    logs,
  });
  const failureClassification = buildFailureClassification({
    failure,
    controlPlane,
    readiness,
    logs,
    postRebalanceClosure,
  });
  const failureGuidance = resolveFailureClassificationGuidance({
    failureClassification,
    readinessFailureGuidance,
    readinessFailure,
  });
  const summaryRootCauseClass = resolveSummaryRootCauseClass(
    failure,
    failureClassification,
  );
  const logWindowCoverage = logs?.logWindowCoverage || null;
  return withholdVerdictForIncompleteCoverage({
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    reportPath: reportOutputPath,
    scenario: entry.scenario,
    summary: {
      logWindowCoverage,
      passed: entry.passed === true,
      error: entry.error || null,
      phase: resolveSummaryPhase(diagnostics, logs),
      rootCauseClass: summaryRootCauseClass,
      dominantReason: failure?.dominantReason || null,
      quiescence: failure?.quiescence || null,
      failureClassification,
      readinessFailure,
      failureAction: failureGuidance.failureAction,
      operatorRecommendation: failureGuidance.operatorRecommendation,
      publicationConvergence,
      stabilityGates,
      ...(postRebalanceClosure ? {postRebalanceClosure} : {}),
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
      ...(postRebalanceClosure ? {postRebalanceClosure} : {}),
    },
    controlSnapshot: controlSnapshotByNodeId,
    controlPlane,
    recoveryReadiness,
    publicationConvergence,
    readiness,
    topFailures: {
      reasonCounts: failureReasonCounts,
      topReasons: buildTopReasonCounts(failureReasonCounts),
      affectedNodeIds: Array.isArray(failure?.affectedNodeIds) ?
        failure.affectedNodeIds :
        [],
      loadMetrics: selectedLoadMetrics || null,
      loadMetricsProvenance: loadMetricsSelection.provenance,
    },
    nodeDiagnostics,
    logs,
    decisionArtifactsByNodeId: logs?.decisionArtifactsByNodeId || {},
    playback: entry.playback || null,
    trace: entry.trace || null,
    stabilityGates,
  }, logWindowCoverage);
}

export const FAILURE_BUNDLE_SCENARIO_ASSEMBLY = {
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
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
  SCENARIO_NAME_FRAGMENT_RESTART,
  LOAD_WAIT_REASON_KEYS,
  LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON,
  toWorkspaceRelative,
  sanitizePathSegment,
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
  formatObservedList,
  formatCountEntries,
  formatPartitioningConvergenceEvaluations,
  formatStabilityGate,
  formatStabilityGateSummary,
  formatReasonPartitionEntries,
  formatProjectionDiagnostics,
  formatPriorityRecoveryInvariantFailures,
};
