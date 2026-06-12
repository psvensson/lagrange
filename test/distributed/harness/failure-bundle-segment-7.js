import {mkdir, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {FAILURE_BUNDLE_SEGMENT_6} from './failure-bundle-segment-6.js';
import {classifyScenarioVerdict} from './validation-matrix.js';
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
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
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
  formatPriorityRecoveryPartitionBlockerHistory,
  formatPriorityRecoveryPartitionSemanticStateHistory,
  formatPriorityRecoveryPartitionWitnesses,
  formatActiveGateProgress,
  formatActiveGateReadinessDelay,
  formatReadinessFailure,
  formatReadinessDimensions,
  formatPublicationMode,
  formatHeartbeatPublication,
  formatNodeLiveness,
  formatTimelineCorrelation,
  formatReadinessTransition,
  formatWorkflowAdmission,
  formatTimeoutClassificationEntry,
  formatNodeClientChannelMetrics,
  formatNodeClientChannelState,
  formatNodeDiagnosticLoadMetrics,
  formatRoutingDiagnostics,
  formatAdminQueryTraceEntry,
  formatFirstFaultTimeline,
  renderScenarioFailureBundleMarkdown,
  buildRunFailureBundle,
  renderRunFailureBundleMarkdown,
} = FAILURE_BUNDLE_SEGMENT_6;

function ensureScenarioDiagnostics(entry) {
  if (!isRecord(entry)) {
    return null;
  }
  if (!isRecord(entry.details)) {
    entry.details = {};
  }
  if (!isRecord(entry.details.diagnostics)) {
    entry.details.diagnostics = {};
  }
  return entry.details.diagnostics;
}

function refreshScenarioVerdict(entry) {
  if (!isRecord(entry)) {
    return;
  }
  const verdict = classifyScenarioVerdict(entry);
  entry.verdict = verdict.verdict;
  entry.verdictReason = verdict.reason;
}

function applyBundleDiagnosticsToScenarioEntry(entry, bundleJson) {
  const diagnostics = ensureScenarioDiagnostics(entry);
  if (!diagnostics || !isRecord(bundleJson)) {
    return;
  }

  if (isRecord(bundleJson.diagnostics?.failure)) {
    diagnostics.failure = bundleJson.diagnostics.failure;
  }

  if (isRecord(bundleJson.summary?.failureClassification)) {
    diagnostics.failureClassification =
      bundleJson.summary.failureClassification;
    entry.failureClassification = bundleJson.summary.failureClassification;
  }

  if (
    typeof bundleJson.summary?.rootCauseClass === 'string' &&
    bundleJson.summary.rootCauseClass.length > ZERO
  ) {
    entry.rootCauseClass = bundleJson.summary.rootCauseClass;
  }

  if (
    typeof bundleJson.summary?.dominantReason === 'string' &&
    bundleJson.summary.dominantReason.length > ZERO
  ) {
    entry.dominantReason = bundleJson.summary.dominantReason;
  }

  if (isRecord(bundleJson.summary?.readinessFailure)) {
    diagnostics.readinessFailure = bundleJson.summary.readinessFailure;
    entry.readinessFailure = bundleJson.summary.readinessFailure;
  }

  if (
    typeof bundleJson.summary?.failureAction === 'string' &&
    bundleJson.summary.failureAction.length > ZERO
  ) {
    diagnostics.failureAction = bundleJson.summary.failureAction;
    entry.failureAction = bundleJson.summary.failureAction;
  }

  if (
    typeof bundleJson.summary?.operatorRecommendation === 'string' &&
    bundleJson.summary.operatorRecommendation.length > ZERO
  ) {
    diagnostics.operatorRecommendation =
      bundleJson.summary.operatorRecommendation;
    entry.operatorRecommendation = bundleJson.summary.operatorRecommendation;
  }

  if (isRecord(bundleJson.publicationConvergence)) {
    diagnostics.publicationConvergence = bundleJson.publicationConvergence;
    entry.publicationConvergence = bundleJson.publicationConvergence;
  }

  if (isRecord(bundleJson.stabilityGates)) {
    diagnostics.stabilityGates = bundleJson.stabilityGates;
    entry.stabilityGates = bundleJson.stabilityGates;
  }

  if (isRecord(bundleJson.controlPlane?.priorityRecoveryDecisionSnapshots)) {
    diagnostics.priorityRecoveryDecisionSnapshots =
      bundleJson.controlPlane.priorityRecoveryDecisionSnapshots;
    entry.priorityRecoveryDecisionSnapshots =
      bundleJson.controlPlane.priorityRecoveryDecisionSnapshots;
  }

  if (isRecord(bundleJson.controlPlane?.priorityRecoveryObservation)) {
    diagnostics.priorityRecoveryObservation =
      bundleJson.controlPlane.priorityRecoveryObservation;
    entry.priorityRecoveryObservation =
      bundleJson.controlPlane.priorityRecoveryObservation;
  }

  if (isRecord(bundleJson.controlPlane?.priorityRecoveryInvariants)) {
    diagnostics.priorityRecoveryInvariants =
      bundleJson.controlPlane.priorityRecoveryInvariants;
    entry.priorityRecoveryInvariants =
      bundleJson.controlPlane.priorityRecoveryInvariants;
  }

  if (
    bundleJson.decisionArtifactsByNodeId &&
    typeof bundleJson.decisionArtifactsByNodeId === 'object'
  ) {
    diagnostics.decisionArtifactsByNodeId =
      bundleJson.decisionArtifactsByNodeId;
    entry.decisionArtifactsByNodeId = bundleJson.decisionArtifactsByNodeId;
  }

  if (isRecord(bundleJson.diagnostics?.firstFaultTimeline)) {
    diagnostics.firstFaultTimeline = bundleJson.diagnostics.firstFaultTimeline;
  }

  if (isRecord(bundleJson.recoveryReadiness)) {
    diagnostics.recoveryReadiness = bundleJson.recoveryReadiness;
    entry.recoveryReadiness = bundleJson.recoveryReadiness;
  }

  if (isRecord(bundleJson.readiness?.nodeReasonsByNodeId)) {
    if (!isRecord(diagnostics.failedPhase)) {
      diagnostics.failedPhase = {};
    }
    if (!isRecord(diagnostics.failedPhase.artifacts)) {
      diagnostics.failedPhase.artifacts = {};
    }
    diagnostics.failedPhase.artifacts.nodeReasonsByNodeId =
      bundleJson.readiness.nodeReasonsByNodeId;
  }

  refreshScenarioVerdict(entry);
}

const SCENARIO_FAILURE_ARTIFACT_FILENAMES = Object.freeze([
  FAILURE_BUNDLE_JSON_FILENAME,
  FAILURE_BUNDLE_MARKDOWN_FILENAME,
  TRIAGE_SUMMARY_JSON_FILENAME,
  TRIAGE_SUMMARY_MARKDOWN_FILENAME,
]);

async function removeScenarioFailureArtifacts(scenarioDir) {
  for (const filename of SCENARIO_FAILURE_ARTIFACT_FILENAMES) {
    await rm(join(scenarioDir, filename), {force: true});
  }
}

async function writeScenarioFailureBundleArtifacts({
  entry,
  scenarioDir,
  absoluteReportPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  workspaceRoot,
}) {
  const logs = await collectScenarioLogArtifacts(
    scenarioDir,
    resolveRelevantNodeIds(entry),
    workspaceRoot,
    entry,
  );
  const bundleJson = buildScenarioFailureBundle({
    entry,
    reportOutputPath: toWorkspaceRelative(absoluteReportPath, workspaceRoot),
    reportSummary,
    standardSummary,
    benchmarkRegressionGate,
    logs,
  });
  applyBundleDiagnosticsToScenarioEntry(entry, bundleJson);
  const jsonAbsolutePath = join(scenarioDir, FAILURE_BUNDLE_JSON_FILENAME);
  const markdownAbsolutePath = join(
    scenarioDir,
    FAILURE_BUNDLE_MARKDOWN_FILENAME,
  );
  const triageJsonAbsolutePath = join(
    scenarioDir,
    TRIAGE_SUMMARY_JSON_FILENAME,
  );
  const triageMarkdownAbsolutePath = join(
    scenarioDir,
    TRIAGE_SUMMARY_MARKDOWN_FILENAME,
  );
  await writeFile(
    jsonAbsolutePath,
    JSON.stringify(bundleJson, null, 2),
    UTF8_ENCODING,
  );
  await writeFile(
    markdownAbsolutePath,
    renderScenarioFailureBundleMarkdown(bundleJson),
    UTF8_ENCODING,
  );
  const triageLinks = {
    jsonPath: toWorkspaceRelative(jsonAbsolutePath, workspaceRoot),
    markdownPath: toWorkspaceRelative(markdownAbsolutePath, workspaceRoot),
  };
  const triageSummary = buildScenarioTriageSummary(bundleJson, triageLinks);
  await writeFile(
    triageJsonAbsolutePath,
    JSON.stringify(triageSummary, null, 2),
    UTF8_ENCODING,
  );
  await writeFile(
    triageMarkdownAbsolutePath,
    renderScenarioTriageSummaryMarkdown(triageSummary),
    UTF8_ENCODING,
  );
  const links = {
    ...triageLinks,
    triageJsonPath: toWorkspaceRelative(
      triageJsonAbsolutePath,
      workspaceRoot,
    ),
    triageMarkdownPath: toWorkspaceRelative(
      triageMarkdownAbsolutePath,
      workspaceRoot,
    ),
  };
  entry.failureBundle = links;
  return {
    scenario: entry.scenario,
    summary: bundleJson.summary,
    links,
  };
}

const FALLBACK_BUNDLE_ARTIFACT_TYPE = 'scenario-failure-bundle-fallback';
const FALLBACK_BUNDLE_NOTE =
  'Full failure-bundle serialization failed; the scenario failure is ' +
  'preserved here, and ground truth remains in .full-logs/ and ' +
  'events.ndjson in the run output directory.';

async function writeScenarioFailureBundleFallback({
  entry,
  scenarioDir,
  workspaceRoot,
  error,
}) {
  const fallbackJson = {
    artifactType: FALLBACK_BUNDLE_ARTIFACT_TYPE,
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    scenario: entry.scenario,
    passed: false,
    scenarioError: String(entry.error || ''),
    bundleWriteError: String(error?.message || error),
    note: FALLBACK_BUNDLE_NOTE,
  };
  const jsonAbsolutePath = join(scenarioDir, FAILURE_BUNDLE_JSON_FILENAME);
  await writeFile(
    jsonAbsolutePath,
    JSON.stringify(fallbackJson, null, 2),
    UTF8_ENCODING,
  );
  const links = {
    jsonPath: toWorkspaceRelative(jsonAbsolutePath, workspaceRoot),
    bundleWriteError: fallbackJson.bundleWriteError,
  };
  entry.failureBundle = links;
  console.warn(
    `[harness] WARNING: failure-bundle write degraded to fallback for ` +
    `scenario ${entry.scenario}: ${fallbackJson.bundleWriteError}`,
  );
  return {
    scenario: entry.scenario,
    summary: {
      scenario: entry.scenario,
      scenarioError: fallbackJson.scenarioError,
      bundleWriteError: fallbackJson.bundleWriteError,
    },
    links,
  };
}

async function writeFailureBundlesForReport({
  scenarios,
  reportOutputPath,
  outputDir,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  workspaceRoot = process.cwd(),
}) {
  const scenarioEntries = Array.isArray(scenarios) ? scenarios : [];
  const absoluteOutputDir = resolve(String(outputDir || '.'));
  const absoluteReportPath = resolve(String(reportOutputPath || ''));
  const scenarioBundles = [];

  for (const entry of scenarioEntries) {
    if (!entry) {
      continue;
    }
    const scenarioName = sanitizePathSegment(entry.scenario, 'scenario');
    const scenarioDir = join(absoluteOutputDir, scenarioName);
    if (entry.passed === true) {
      await removeScenarioFailureArtifacts(scenarioDir);
      delete entry.failureBundle;
      continue;
    }
    await mkdir(scenarioDir, {recursive: true});
    // A bundle that cannot serialize (e.g. RangeError: Invalid string
    // length on long runs) must degrade to a minimal artifact, never take
    // down the report: the report records WHAT failed; the bundle is only
    // the pre-digested HOW.
    try {
      scenarioBundles.push(
        await writeScenarioFailureBundleArtifacts({
          entry,
          scenarioDir,
          absoluteReportPath,
          reportSummary,
          standardSummary,
          benchmarkRegressionGate,
          workspaceRoot,
        }),
      );
    } catch (bundleError) {
      scenarioBundles.push(
        await writeScenarioFailureBundleFallback({
          entry,
          scenarioDir,
          workspaceRoot,
          error: bundleError,
        }),
      );
    }
  }

  if (scenarioBundles.length === ZERO) {
    await rm(join(absoluteOutputDir, FAILURE_BUNDLE_RUN_DIRNAME), {
      recursive: true,
      force: true,
    });
    return {runBundle: null, scenarioBundles: []};
  }

  const runBundleDir = join(absoluteOutputDir, FAILURE_BUNDLE_RUN_DIRNAME);
  await mkdir(runBundleDir, {recursive: true});
  try {
    const runBundleJson = buildRunFailureBundle({
      reportOutputPath: toWorkspaceRelative(absoluteReportPath, workspaceRoot),
      reportSummary,
      standardSummary,
      benchmarkRegressionGate,
      scenarioBundles,
    });
    const runJsonAbsolutePath = join(
      runBundleDir,
      RUN_FAILURE_BUNDLE_JSON_FILENAME,
    );
    const runMarkdownAbsolutePath = join(
      runBundleDir,
      RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME,
    );
    await writeFile(
      runJsonAbsolutePath,
      JSON.stringify(runBundleJson, null, 2),
      UTF8_ENCODING,
    );
    await writeFile(
      runMarkdownAbsolutePath,
      renderRunFailureBundleMarkdown(runBundleJson),
      UTF8_ENCODING,
    );

    return {
      runBundle: {
        jsonPath: toWorkspaceRelative(runJsonAbsolutePath, workspaceRoot),
        markdownPath: toWorkspaceRelative(
          runMarkdownAbsolutePath,
          workspaceRoot,
        ),
      },
      scenarioBundles,
    };
  } catch (runBundleError) {
    console.warn(
      `[harness] WARNING: run failure-bundle write failed: ` +
      `${String(runBundleError?.message || runBundleError)}`,
    );
    return {runBundle: null, scenarioBundles};
  }
}

export const FAILURE_BUNDLE_SEGMENT_7 = {
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
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
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
  formatPriorityRecoveryPartitionBlockerHistory,
  formatPriorityRecoveryPartitionSemanticStateHistory,
  formatPriorityRecoveryPartitionWitnesses,
  formatActiveGateProgress,
  formatActiveGateReadinessDelay,
  formatReadinessFailure,
  formatReadinessDimensions,
  formatPublicationMode,
  formatHeartbeatPublication,
  formatNodeLiveness,
  formatTimelineCorrelation,
  formatReadinessTransition,
  formatWorkflowAdmission,
  formatTimeoutClassificationEntry,
  formatNodeClientChannelMetrics,
  formatNodeClientChannelState,
  formatNodeDiagnosticLoadMetrics,
  formatRoutingDiagnostics,
  formatAdminQueryTraceEntry,
  formatFirstFaultTimeline,
  renderScenarioFailureBundleMarkdown,
  buildRunFailureBundle,
  renderRunFailureBundleMarkdown,
  ensureScenarioDiagnostics,
  applyBundleDiagnosticsToScenarioEntry,
  writeFailureBundlesForReport,
};
