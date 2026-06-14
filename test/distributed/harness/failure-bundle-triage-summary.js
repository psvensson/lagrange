import {PRIORITY_RECOVERY_INVARIANT_FALLBACK} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  JOINING_PHASE,
} from '../../../src/bootstrap/bootstrap-constants.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../../src/control-plane/control-plane-readiness-constants.js';
import {
  POST_REBALANCE_CLOSURE_STATE,
} from './post-rebalance-closure-contract.js';
import {
  CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON,
} from './control-plane-quiescence-snapshot.js';
import {
  hasMeaningfulPriorityRecoveryProgressWitness,
} from './priority-recovery-summary-normalization.js';
import {FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT} from './failure-bundle-diagnostics-contract-reexport.js';
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
  PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
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
  hasPublicationMissingActiveNodeBlocker,
  hasBlockingPublicationClosureRecord,
  isStartupReadinessBlocked,
  countRestartBoundaries,
  buildConvergenceStabilityGate,
  buildFailoverStabilityGate,
} = FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT;

import {
  ACTIVE_GATE_PUBLICATION_GATE_PREFIX,
  ACTIVE_GATE_REASON_PRIORITY_CONTROL_PLANE_SPREAD_PENDING,
  ARRAY_LAST_INDEX,
  DECISION_ARTIFACT_LATEST_FIELD,
  FAILURE_ACTION_LOAD_PRESSURE,
  FAILURE_ACTION_POST_ACTIVE_CONVERGENCE_TIMEOUT,
  FAILURE_ACTION_POST_REBALANCE_CLOSURE_OPEN,
  FAILURE_ACTION_PRIORITY_RECOVERY_PROGRESS_BLOCKED,
  FAILURE_ACTION_STARTUP_READINESS_BLOCKED,
  FAILURE_BUNDLE_POST_REBALANCE_CLOSURE_UNAVAILABLE,
  FAILURE_GUIDANCE_EMPTY,
  FAILURE_REASON_CONVERGENCE_TIMEOUT,
  FAILURE_SIGNAL_BLOCKED_NODE_COUNT_PREFIX,
  FAILURE_SIGNAL_CLOSURE_RECORD_ID_PREFIX,
  FAILURE_SIGNAL_CLOSURE_WITNESS_CLASS_PREFIX,
  FAILURE_SIGNAL_DOMINANT_REASON_PREFIX,
  FAILURE_SIGNAL_FAILURE_BARRIER_PREFIX,
  FAILURE_SIGNAL_FAILURE_BARRIER_REASON_PREFIX,
  FAILURE_SIGNAL_MISSING_PUBLISHED_COUNT_PREFIX,
  FAILURE_SIGNAL_MISSING_PUBLISHED_NODE_IDS_PREFIX,
  FAILURE_SIGNAL_PENDING_ACK_COUNT_PREFIX,
  FAILURE_SIGNAL_POST_REBALANCE_BLOCKER_PREFIX,
  FAILURE_SIGNAL_POST_REBALANCE_CLOSURE_STATE_PREFIX,
  FAILURE_SIGNAL_POST_REBALANCE_DIMENSION_PREFIX,
  FAILURE_SIGNAL_POST_REBALANCE_REASON_PREFIX,
  FAILURE_SIGNAL_POST_REBALANCE_SOFT_CLOSURE_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_BLOCKED_PARTITION_COUNT_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_BOUNDARY_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_FAILING_INVARIANTS_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_LATEST_STATUS_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_LATEST_STEP_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_NEXT_ACTION_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_OWNER_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_PARTITION_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_PROGRESS_CLASS_COUNT_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_READINESS_NODE_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_REASON_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_SEMANTIC_STATE_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_UNRESOLVED_PARTITION_PREFIX,
  FAILURE_SIGNAL_PRIORITY_RECOVERY_WAIT_MODE_PREFIX,
  FAILURE_SIGNAL_PRIORITY_SPREAD_PENDING,
  FAILURE_SIGNAL_QUIESCENCE_BLOCKER_PREFIX,
  FAILURE_SIGNAL_QUIESCENCE_CANDIDATE_WINDOW_RESET_PREFIX,
  FAILURE_SIGNAL_QUIESCENCE_REASON_PREFIX,
  FAILURE_SIGNAL_QUIESCENCE_STATE_PREFIX,
  FAILURE_SIGNAL_RECOVERY_PROTOCOL_STATE_PREFIX,
  FAILURE_SIGNAL_STARTUP_OWNER_PREFIX,
  FAILURE_SIGNAL_STARTUP_PHASE_PREFIX,
  FAILURE_SIGNAL_STARTUP_READINESS_REASON_PREFIX,
  FAILURE_SIGNAL_STARTUP_RETRY_AFTER_MS_PREFIX,
  FAILURE_SIGNAL_VALUE_SEPARATOR,
  OPERATOR_RECOMMENDATION_LOAD_PRESSURE,
  OPERATOR_RECOMMENDATION_POST_ACTIVE_CONVERGENCE_TIMEOUT,
  OPERATOR_RECOMMENDATION_POST_REBALANCE_CLOSURE_OPEN,
  OPERATOR_RECOMMENDATION_PRIORITY_RECOVERY_PROGRESS_BLOCKED,
  OPERATOR_RECOMMENDATION_STARTUP_READINESS_BLOCKED,
  READINESS_FAILURE_CLASS_SNAPSHOT_REACHABILITY_TIMEOUT,
  READINESS_FAILURE_CLASS_SNAPSHOT_TIMEOUT,
  STARTUP_OWNER_EVIDENCE_BY_STATE,
  STARTUP_OWNER_EVIDENCE_STATE,
  TIMED_OUT_REASON_FRAGMENT,
  TIMEOUT_REASON_FRAGMENT,
} from './failure-bundle-classification-constants.js';

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
    opsPerSec: Number.isFinite(Number(loadMetrics.opsPerSec)) ?
      Number(loadMetrics.opsPerSec) :
      null,
    dispatchedOperations: normalizeNonNegativeCount(
      loadMetrics.dispatchedOperations,
    ),
    undispatchedOperations: normalizeNonNegativeCount(
      loadMetrics.undispatchedOperations,
    ),
    waitReasons: isRecord(loadMetrics.waitReasons) ?
      loadMetrics.waitReasons :
      {},
    perNodeTopAttemptErrors: perNodeEntries,
  };
}

function resolvePartitioningDiagnosticsForTriage(bundleJson) {
  const artifacts = isRecord(bundleJson?.diagnostics?.failedPhase?.artifacts) ?
    bundleJson.diagnostics.failedPhase.artifacts :
    {};
  const partitionGrowth = isRecord(artifacts.partitionGrowth) ?
    artifacts.partitionGrowth :
    null;
  const planner = isRecord(artifacts.partitioningPlanner) ?
    artifacts.partitioningPlanner :
    null;
  if (!partitionGrowth && !planner) {
    return null;
  }
  return {
    failureMode:
      typeof partitionGrowth?.failureMode === 'string' ?
        partitionGrowth.failureMode :
        null,
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
      typeof partitionGrowth?.lastQueryError === 'string' ?
        partitionGrowth.lastQueryError :
        null,
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
    readinessReasonHistogram: isRecord(planner?.readinessReasonHistogram) ?
      planner.readinessReasonHistogram :
      {},
    convergenceStateHistogram: isRecord(planner?.convergenceStateHistogram) ?
      planner.convergenceStateHistogram :
      {},
    dispatchContributionHistogram: isRecord(
      planner?.dispatchContributionHistogram,
    ) ?
      planner.dispatchContributionHistogram :
      {},
    degradationStateHistogram: isRecord(planner?.degradationStateHistogram) ?
      planner.degradationStateHistogram :
      {},
    criticalControlPlaneStability: isRecord(
      planner?.criticalControlPlaneStability,
    ) ?
      {
        state:
            typeof planner.criticalControlPlaneStability.state === 'string' ?
              planner.criticalControlPlaneStability.state :
              null,
        reasonCodes: normalizeDistinctStringArray(
          planner.criticalControlPlaneStability.reasonCodes,
        ),
        retryAfterMs: normalizeNonNegativeCount(
          planner.criticalControlPlaneStability.retryAfterMs,
        ),
      } :
      null,
    convergenceEvaluations: Array.isArray(planner?.convergenceEvaluations) ?
      planner.convergenceEvaluations
        .filter((evaluation) => isRecord(evaluation))
        .map((evaluation) => ({
          nodeId:
              typeof evaluation.nodeId === 'string' ? evaluation.nodeId : null,
          state:
              typeof evaluation.state === 'string' ? evaluation.state : null,
          dispatchContributionState:
              typeof evaluation.dispatchContributionState === 'string' ?
                evaluation.dispatchContributionState :
                null,
          localReplicaRole:
              typeof evaluation.localReplicaRole === 'string' ?
                evaluation.localReplicaRole :
                null,
          localReplicaVoterReady: evaluation.localReplicaVoterReady === true,
          leadershipStable: evaluation.leadershipStable === true,
          admissionReady: evaluation.admissionReady === true,
          replicaBearing: evaluation.replicaBearing === true,
          degradationState:
              typeof evaluation.degradationState === 'string' ?
                evaluation.degradationState :
                null,
          reasonCodes: normalizeDistinctStringArray(evaluation.reasonCodes),
          retryAfterMs: normalizeNonNegativeCount(evaluation.retryAfterMs),
        })) :
      [],
  };
}

function buildRoutingDiagnosticsSummary(nodeDiagnostics) {
  const summaryByNodeId = {};
  for (const [nodeId, diagnostic] of Object.entries(
    isRecord(nodeDiagnostics) ? nodeDiagnostics : {},
  )) {
    const routingDiagnostics = isRecord(diagnostic?.routingDiagnostics) ?
      diagnostic.routingDiagnostics :
      null;
    const timelineCorrelation = isRecord(diagnostic?.timelineCorrelation) ?
      diagnostic.timelineCorrelation :
      null;
    if (!routingDiagnostics && !timelineCorrelation) {
      continue;
    }
    summaryByNodeId[nodeId] = {
      routingDiagnostics,
      timelineCorrelation: timelineCorrelation ?
        {
          firstLoadFailureAt: timelineCorrelation.firstLoadFailureAt || null,
          firstSplitStartedAt:
              timelineCorrelation.firstSplitStartedAt || null,
          firstSplitRejectedAt:
              timelineCorrelation.firstSplitRejectedAt || null,
          firstSplitFailedAt: timelineCorrelation.firstSplitFailedAt || null,
        } :
        null,
    };
  }
  return Object.keys(summaryByNodeId).length > ZERO ? summaryByNodeId : null;
}

function buildScenarioTriageSummary(bundleJson, links = {}) {
  const readinessFailure =
    bundleJson?.summary?.readinessFailure &&
    typeof bundleJson.summary.readinessFailure === 'object' ?
      bundleJson.summary.readinessFailure :
      null;
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
      ) ?
        bundleJson.summary.failureClassification.signals :
        [],
      readinessFailure,
      failureAction: bundleJson?.summary?.failureAction || null,
      operatorRecommendation:
        bundleJson?.summary?.operatorRecommendation || null,
      bottleneckKind: bundleJson?.summary?.bottleneckEstimate?.kind || null,
      stabilityGates: isRecord(bundleJson?.summary?.stabilityGates) ?
        bundleJson.summary.stabilityGates :
        isRecord(bundleJson?.stabilityGates) ?
          bundleJson.stabilityGates :
          null,
      affectedNodeIds: normalizeDistinctStringArray(
        bundleJson?.topFailures?.affectedNodeIds,
      ),
      topReasons: Array.isArray(bundleJson?.topFailures?.topReasons) ?
        bundleJson.topFailures.topReasons :
        [],
    },
    artifacts: {
      reportPath: bundleJson?.reportPath || null,
      analysisPath: bundleJson?.logs?.analysisPath || null,
      timelinePath: bundleJson?.logs?.timelinePath || null,
      playbackEventsPath: bundleJson?.logs?.playbackEventsPath || null,
      nodeLogPaths: isRecord(bundleJson?.logs?.nodeLogPaths) ?
        bundleJson.logs.nodeLogPaths :
        {},
      failureBundleJsonPath: links.jsonPath || null,
      failureBundleMarkdownPath: links.markdownPath || null,
    },
    load: buildTriageLoadSummary(bundleJson?.topFailures?.loadMetrics),
    publicationConvergence: isRecord(bundleJson?.publicationConvergence) ?
      cloneJsonValue(bundleJson.publicationConvergence) :
      null,
    playback: {
      firstFaultTimeline: isRecord(bundleJson?.diagnostics?.firstFaultTimeline) ?
        bundleJson.diagnostics.firstFaultTimeline :
        null,
      eventSummary: isRecord(bundleJson?.logs?.playbackEventSummary) ?
        bundleJson.logs.playbackEventSummary :
        null,
    },
    partitioning: resolvePartitioningDiagnosticsForTriage(bundleJson),
    routingDiagnosticsByNodeId: buildRoutingDiagnosticsSummary(
      bundleJson?.nodeDiagnostics,
    ),
    recoveryReadiness: isRecord(bundleJson?.recoveryReadiness) ?
      {
        pendingAckBlockedNodeIds: normalizeDistinctStringArray(
          bundleJson.recoveryReadiness.pendingAckBlockedNodeIds,
        ),
        routingDimensionCounts: isRecord(
          bundleJson.recoveryReadiness.routingDimensionCounts,
        ) ?
          bundleJson.recoveryReadiness.routingDimensionCounts :
          {},
      } :
      null,
  };
}

function formatReadinessFailure(readinessFailure) {
  const normalized = normalizeReadinessFailure(readinessFailure);
  if (!normalized) {
    return UNKNOWN_VALUE;
  }
  const parts = [
    'class=' + String(normalized.classCode || UNKNOWN_VALUE),
    'mode=' + String(normalized.mode || UNKNOWN_VALUE),
    'recoverability=' + String(normalized.recoverability || UNKNOWN_VALUE),
  ];
  if (normalized.source) {
    parts.push('source=' + normalized.source);
  }
  if (normalized.cause) {
    parts.push('cause=' + normalized.cause);
  }
  if (normalized.terminalReason) {
    parts.push('terminalReason=' + normalized.terminalReason);
  }
  if (Number.isInteger(normalized.progressSignal?.attemptsSinceProgress)) {
    const attempts = String(normalized.progressSignal.attemptsSinceProgress);
    const maxAttempts = Number.isInteger(normalized.progressSignal?.maxAttempts) ?
      String(normalized.progressSignal.maxAttempts) :
      UNKNOWN_VALUE;
    parts.push('attemptsSinceProgress=' + attempts + '/' + maxAttempts);
  }
  return parts.join(', ');
}

function renderScenarioTriageSummaryMarkdown(summary) {
  const lines = [
    '# Scenario Triage Summary',
    '',
    `- Scenario: ${summary?.scenario || UNKNOWN_VALUE}`,
    `- Phase: ${summary?.summary?.phase || UNKNOWN_VALUE}`,
    `- Root Cause Class: ${summary?.summary?.rootCauseClass || UNKNOWN_VALUE}`,
    `- Dominant Reason: ${summary?.summary?.dominantReason || UNKNOWN_VALUE}`,
    `- Failure Class: ${summary?.summary?.failureClass || UNKNOWN_VALUE}`,
    `- Readiness Failure: ${formatReadinessFailure(summary?.summary?.readinessFailure)}`,
    `- Failure Class Signals: ${
      Array.isArray(summary?.summary?.failureClassSignals) &&
      summary.summary.failureClassSignals.length > ZERO ?
        summary.summary.failureClassSignals.join('|') :
        UNKNOWN_VALUE
    }`,
    `- Failure Action: ${summary?.summary?.failureAction || UNKNOWN_VALUE}`,
    `- Operator Recommendation: ${
      summary?.summary?.operatorRecommendation || UNKNOWN_VALUE
    }`,
    `- Bottleneck: ${summary?.summary?.bottleneckKind || UNKNOWN_VALUE}`,
  ];

  lines.push('', '## Stability Gates', '');
  lines.push(formatStabilityGateSummary(summary?.summary?.stabilityGates));

  const publicationConvergence = isRecord(summary?.publicationConvergence) ?
    summary.publicationConvergence :
    null;
  if (publicationConvergence) {
    lines.push('', '## Publication Convergence', '');
    lines.push(
      `- Publication Epoch: ${
        String(publicationConvergence.publicationEpoch ?? UNKNOWN_VALUE)
      }`,
    );
    lines.push(
      `- Publication Status: ${
        publicationConvergence.publicationStatus || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Recovery Protocol State: ${
        publicationConvergence.recoveryProtocolState || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Pending Ack Count: ${
        String(publicationConvergence.pendingAckCount ?? UNKNOWN_VALUE)
      }`,
    );
    lines.push(
      `- Pending Ack Nodes: ${
        formatObservedList(publicationConvergence.pendingAckNodeIds)
      }`,
    );
    lines.push(
      `- Publication Gate Reasons: ${
        formatObservedList(
          publicationConvergence.publicationConvergenceGateReasons,
        )
      }`,
    );
    lines.push(
      `- Blocked Partition Count: ${
        String(
          publicationConvergence.priorityRecoveryBlockedPartitionCount ??
            UNKNOWN_VALUE,
        )
      }`,
    );
    lines.push(
      `- Blocked Partitions: ${
        formatObservedList(
          publicationConvergence.priorityRecoveryBlockedPartitionIds,
        )
      }`,
    );
    lines.push(
      `- Unresolved Partition Count: ${
        String(
          publicationConvergence.priorityRecoveryUnresolvedPartitionCount ??
            UNKNOWN_VALUE,
        )
      }`,
    );
    lines.push(
      `- Unresolved Partitions: ${
        formatObservedList(
          publicationConvergence.priorityRecoveryUnresolvedPartitionIds,
        )
      }`,
    );
    lines.push(
      `- Closure Record Id: ${
        publicationConvergence.closureRecordId || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Closure Witness Class: ${
        publicationConvergence.closureWitnessClass || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Projection Diagnostics: ${
        formatProjectionDiagnostics(publicationConvergence.projectionDiagnostics)
      }`,
    );
    lines.push(
      `- Failing Invariants: ${
        formatObservedList(
          publicationConvergence.priorityRecoveryInvariantFailingIds,
        )
      }`,
    );
    lines.push(
      `- Progress Summary: ${
        formatPriorityRecoveryProgressSummary(
          publicationConvergence.priorityRecoveryProgressSummary,
        )
      }`,
    );
  }

  lines.push(
    '',
    '## Artifact Paths',
    '',
    `- Report: ${summary?.artifacts?.reportPath || UNKNOWN_VALUE}`,
    `- Failure Bundle JSON: ${summary?.artifacts?.failureBundleJsonPath || UNKNOWN_VALUE}`,
    `- Failure Bundle Markdown: ${summary?.artifacts?.failureBundleMarkdownPath || UNKNOWN_VALUE}`,
    `- Playback Events: ${summary?.artifacts?.playbackEventsPath || UNKNOWN_VALUE}`,
    `- Timeline: ${summary?.artifacts?.timelinePath || UNKNOWN_VALUE}`,
    `- Analysis: ${summary?.artifacts?.analysisPath || UNKNOWN_VALUE}`,
  );

  const topReasons = Array.isArray(summary?.summary?.topReasons) ?
    summary.summary.topReasons :
    [];
  lines.push('', '## Top Reasons', '');
  if (topReasons.length === ZERO) {
    lines.push('- none');
  } else {
    for (const reason of topReasons) {
      lines.push(
        `- ${String(reason?.reason || UNKNOWN_VALUE)}: ` +
          `${String(reason?.count ?? UNKNOWN_VALUE)}`,
      );
    }
  }

  const playbackEventSummary = summary?.playback?.eventSummary || null;
  lines.push('', '## Playback', '');
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
    lines.push('', '## Partitioning', '');
    lines.push(`- Failure Mode: ${partitioning.failureMode || UNKNOWN_VALUE}`);
    lines.push(
      '- Baseline -> Current Partitions: ' +
        `${String(partitioning.baselinePartitionCount ?? UNKNOWN_VALUE)} -> ` +
        `${String(partitioning.currentPartitionCount ?? UNKNOWN_VALUE)}`,
    );
    lines.push(
      '- Additional Partitions Seen: ' +
        `${String(partitioning.additionalPartitionCount ?? UNKNOWN_VALUE)}`,
    );
    lines.push(
      `- Replica Spread Nodes: ${String(partitioning.replicaNodeCount ?? UNKNOWN_VALUE)}`,
    );
    lines.push(
      `- Selected Nodes: ${
        partitioning.selectedNodeIds?.join(', ') || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Ready Replica Nodes: ${
        partitioning.readyReplicaNodeIds?.join(', ') || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Admission-Ready Nodes: ${
        partitioning.admissionReadyNodeIds?.join(', ') || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Local Primary Nodes: ${
        partitioning.localPrimaryNodeIds?.join(', ') || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Routed Support Nodes: ${
        partitioning.routedSupportNodeIds?.join(', ') || UNKNOWN_VALUE
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
        partitioning.criticalControlPlaneStability?.reasonCodes?.join(', ') ||
        UNKNOWN_VALUE
      }`,
    );
    lines.push('- Convergence Evaluations:');
    lines.push(
      formatPartitioningConvergenceEvaluations(
        partitioning.convergenceEvaluations,
      ),
    );
  }

  const routingDiagnosticsByNodeId = isRecord(
    summary?.routingDiagnosticsByNodeId,
  ) ?
    summary.routingDiagnosticsByNodeId :
    {};
  lines.push('', '## Routing Diagnostics', '');
  if (Object.keys(routingDiagnosticsByNodeId).length === ZERO) {
    lines.push('- none');
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

  return lines.join('\n') + '\n';
}

function formatList(values) {
  const items = Array.isArray(values) ?
    values
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > ZERO) :
    [];
  return items.length > ZERO ? items.join(', ') : UNKNOWN_VALUE;
}

function formatObservedList(values) {
  if (!Array.isArray(values)) {
    return UNKNOWN_VALUE;
  }
  const items = values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > ZERO);
  return items.length > ZERO ? items.join(', ') : 'none';
}

function formatProjectionDiagnostics(projectionDiagnostics) {
  if (!isRecord(projectionDiagnostics)) {
    return UNKNOWN_VALUE;
  }
  return [
    'mode=' +
      String(projectionDiagnostics.readinessDecisionMode || UNKNOWN_VALUE),
    'dimensions=' +
      formatObservedList(projectionDiagnostics.readinessDecisionDimensions),
    'recoveryEligibleProjectionEnabled=' +
      String(
        projectionDiagnostics.recoveryEligibleProjectionEnabled === true,
      ),
    'recoveryEligibleIncluded=' +
      formatObservedList(
        projectionDiagnostics.recoveryEligibleIncludedNodeIds,
      ),
    'readinessExcluded=' +
      formatObservedList(projectionDiagnostics.readinessExcludedNodeIds),
    'clusterMemberUnhealthyExcluded=' +
      formatObservedList(
        projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds,
      ),
  ].join(', ');
}

function formatPriorityRecoveryProgressSummary(progressSummary) {
  if (!isRecord(progressSummary)) {
    return UNKNOWN_VALUE;
  }
  const dominantWitness =
    progressSummary?.dominantWitness && isRecord(progressSummary.dominantWitness) ?
      progressSummary.dominantWitness :
      null;
  const parts = [
    'partitionCount=' + String(progressSummary.partitionCount ?? UNKNOWN_VALUE),
  ];
  if (dominantWitness?.partitionId) {
    parts.push('partition=' + dominantWitness.partitionId);
  }
  if (dominantWitness?.currentOwner) {
    parts.push('owner=' + dominantWitness.currentOwner);
  }
  if (dominantWitness?.actuationState) {
    parts.push('actuation=' + dominantWitness.actuationState);
  }
  if (dominantWitness?.blockingBoundary) {
    parts.push('boundary=' + dominantWitness.blockingBoundary);
  }
  if (dominantWitness?.waitMode) {
    parts.push('waitMode=' + dominantWitness.waitMode);
  }
  if (dominantWitness?.nextRequiredAction) {
    parts.push('nextAction=' + dominantWitness.nextRequiredAction);
  }
  if (dominantWitness?.progressContractState) {
    parts.push('contractState=' + dominantWitness.progressContractState);
  }
  if (dominantWitness?.pressureState) {
    parts.push('pressure=' + dominantWitness.pressureState);
  }
  if (dominantWitness?.retryAfterMs !== undefined) {
    parts.push('retryAfterMs=' + String(dominantWitness.retryAfterMs));
  }
  if (dominantWitness?.lastProgressAtMs !== undefined) {
    parts.push('lastProgressAtMs=' + String(dominantWitness.lastProgressAtMs));
  }
  return parts.join(', ');
}

function formatCountEntries(entries) {
  if (!entries || typeof entries !== 'object') {
    return UNKNOWN_VALUE;
  }
  const rendered = Object.entries(entries)
    .map(([key, count]) => `${key}:${String(count ?? ZERO)}`)
    .filter((entry) => entry.length > ZERO);
  return rendered.length > ZERO ? rendered.join(', ') : UNKNOWN_VALUE;
}

function formatPartitioningConvergenceEvaluations(evaluations) {
  const rendered = (Array.isArray(evaluations) ? evaluations : [])
    .filter((evaluation) => isRecord(evaluation))
    .map((evaluation) => {
      const nodeId = String(evaluation.nodeId || '').trim();
      if (nodeId.length === ZERO) {
        return null;
      }
      const reasonCodes = normalizeDistinctStringArray(evaluation.reasonCodes);
      return [
        nodeId,
        'state=' + String(evaluation.state || UNKNOWN_VALUE),
        'dispatch=' +
          String(evaluation.dispatchContributionState || UNKNOWN_VALUE),
        'role=' + String(evaluation.localReplicaRole || UNKNOWN_VALUE),
        'voterReady=' + String(evaluation.localReplicaVoterReady === true),
        'leaderStable=' + String(evaluation.leadershipStable === true),
        'replicaBearing=' + String(evaluation.replicaBearing === true),
        'admissionReady=' + String(evaluation.admissionReady === true),
        'degradation=' + String(evaluation.degradationState || UNKNOWN_VALUE),
        'reasons=' +
          (reasonCodes.length > ZERO ? reasonCodes.join('|') : UNKNOWN_VALUE),
        'retryAfterMs=' + String(evaluation.retryAfterMs ?? UNKNOWN_VALUE),
      ].join(', ');
    })
    .filter(Boolean);
  return rendered.length > ZERO ? rendered.join('\n') : '- none';
}

function formatStabilityGate(gate) {
  if (!isRecord(gate)) {
    return UNKNOWN_VALUE;
  }
  const parts = ['status=' + String(gate.status || UNKNOWN_VALUE)];
  const blockers = normalizeDistinctStringArray(gate.blockers);
  if (blockers.length > ZERO) {
    parts.push('blockers=' + blockers.join('|'));
  }
  const closureRecordId = String(gate?.evidence?.closureRecordId || '').trim();
  if (closureRecordId.length > ZERO) {
    parts.push('closureRecordId=' + closureRecordId);
  }
  const restartBoundaryCount = normalizeNonNegativeCount(
    gate?.evidence?.restartBoundaryCount,
  );
  if (restartBoundaryCount !== null) {
    parts.push('restartBoundaryCount=' + String(restartBoundaryCount));
  }
  const pendingAckCount = normalizeNonNegativeCount(
    gate?.evidence?.pendingAckCount,
  );
  if (pendingAckCount !== null) {
    parts.push('pendingAckCount=' + String(pendingAckCount));
  }
  const blockedNodeCount = normalizeNonNegativeCount(
    gate?.evidence?.blockedNodeCount,
  );
  if (blockedNodeCount !== null) {
    parts.push('blockedNodeCount=' + String(blockedNodeCount));
  }
  return parts.join(', ');
}

function formatStabilityGateSummary(stabilityGates) {
  const entries = Object.values(
    isRecord(stabilityGates) ? stabilityGates : {},
  ).filter((gate) => isRecord(gate));
  if (entries.length === ZERO) {
    return '- none';
  }
  return entries
    .map(
      (gate) =>
        `- ${String(gate.type || UNKNOWN_VALUE)}: ${formatStabilityGate(gate)}`,
    )
    .join('\n');
}

function formatReasonPartitionEntries(entriesByReason) {
  if (!entriesByReason || typeof entriesByReason !== 'object') {
    return UNKNOWN_VALUE;
  }
  const rendered = Object.entries(entriesByReason)
    .map(([reason, partitionIds]) => {
      const normalizedReason = String(reason || '').trim();
      if (normalizedReason.length === ZERO) {
        return null;
      }
      const normalizedPartitionIds = normalizeDistinctStringArray(partitionIds);
      return (
        normalizedReason +
        ':' +
        (normalizedPartitionIds.length > ZERO ?
          normalizedPartitionIds.join('|') :
          UNKNOWN_VALUE)
      );
    })
    .filter((entry) => entry !== null);
  return rendered.length > ZERO ? rendered.join(', ') : UNKNOWN_VALUE;
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
    .join(', ');
}

export {
  buildRoutingDiagnosticsSummary,
  buildScenarioTriageSummary,
  buildTriageLoadSummary,
  formatCountEntries,
  formatList,
  formatObservedList,
  formatPartitioningConvergenceEvaluations,
  formatPriorityRecoveryInvariantFailures,
  formatPriorityRecoveryProgressSummary,
  formatProjectionDiagnostics,
  formatReadinessFailure,
  formatReasonPartitionEntries,
  formatStabilityGate,
  formatStabilityGateSummary,
  renderScenarioTriageSummaryMarkdown,
  resolvePartitioningDiagnosticsForTriage,
};
