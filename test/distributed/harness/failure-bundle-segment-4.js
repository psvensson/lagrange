import {
  classifyActiveGateClosureWitness,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT,
} from './active-gate-closure-classification.js';
import {
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';
import {
  CONTROL_PLANE_QUIESCENCE_REASON,
  CONTROL_PLANE_QUIESCENCE_STATE,
} from './control-plane-quiescence-snapshot.js';
import {
  buildCanonicalControlPlaneDiagnosticsFromControlPlane,
  buildCanonicalPublicationEvidenceFromControlPlane,
} from
  './publication-evidence-contract.js';
import {
  buildPriorityRecoveryProgressSummary,
  normalizePriorityRecoveryPartitionWitnessesForDiagnostics,
} from './priority-recovery-summary-normalization.js';
import {FAILURE_BUNDLE_SEGMENT_3} from './failure-bundle-segment-3.js';
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
  hasBlockingReadinessFailure,
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

const FINAL_CONSISTENCY_LEADER_MISMATCH_MESSAGE_PREFIX =
  'Leader identities disagree';
const FINAL_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE =
  'leader_identities_disagree';
const FINAL_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG =
  'observer_snapshot_revision_lag';
const FINAL_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
const FINAL_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED =
  'partition_leader_authority_diverged';
const FINAL_CONSISTENCY_REASON_CDC_VISIBILITY_LAG =
  'cdc_visibility_lag';
const FINAL_CONSISTENCY_REASON_TRANSPORT_DELIVERY_DEFERRED =
  'transport_delivery_deferred';
const FINAL_CONSISTENCY_REASON_UNCLASSIFIED =
  'final_consistency_unclassified';
const FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH =
  'leader_map_mismatch';
const FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG =
  'observer_revision_lag';
const FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
const FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED = 'authority_diverged';
const FINAL_CONSISTENCY_STATE_CDC_VISIBILITY_LAG =
  'cdc_visibility_lag';
const FINAL_CONSISTENCY_STATE_TRANSPORT_DELIVERY_DEFERRED =
  'transport_delivery_deferred';
const FINAL_CONSISTENCY_CACHE_REASON_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG,
  FINAL_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG,
]));
const FINAL_CONSISTENCY_CACHE_STATE_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG,
  FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
]));
const FINAL_CONSISTENCY_CDC_REASON_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_REASON_CDC_VISIBILITY_LAG,
  FINAL_CONSISTENCY_REASON_TRANSPORT_DELIVERY_DEFERRED,
]));
const FINAL_CONSISTENCY_CDC_STATE_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_STATE_CDC_VISIBILITY_LAG,
  FINAL_CONSISTENCY_STATE_TRANSPORT_DELIVERY_DEFERRED,
]));
const FINAL_CONSISTENCY_TOPOLOGY_REASON_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE,
  FINAL_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED,
]));
const FINAL_CONSISTENCY_TOPOLOGY_STATE_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH,
  FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED,
]));
const FAILURE_ARTIFACT_ACTIVE_GATE_READY_BLOCKER = 'ready';
const FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET = Object.freeze(new Set([
  'control_plane_publication_pending',
  'publishedConvergencePending',
  'recovery_eligibility_pending',
  'publication_epoch_pending',
  'publication_pending_ack',
  'priority_partitions_not_spread',
  'closure_witness_publication_converged_priority_spread_pending',
  'priority_recovery_progress_class',
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
]));
const FAILURE_BARRIER_PHASE_CONVERGENCE = 'convergence';
const FAILURE_BARRIER_PHASE_RESTART_RECOVERY =
  STABILITY_GATE_TYPE_RESTART_RECOVERY;
const FAILURE_BARRIER_REASON_CONVERGENCE_TIMEOUT = 'convergence_timeout';
const FAILURE_BARRIER_REASON_RESTART_RECOVERY_TIMEOUT =
  'restart_recovery_timeout';
const FAILURE_BARRIER_ERROR_PREFIX_CONVERGENCE_TIMEOUT =
  'Convergence timeout after ';
const FAILURE_BARRIER_ERROR_PREFIX_RESTART_RECOVERY_TIMEOUT =
  'Restarted node did not become recovery-ready within ';
const FAILURE_BARRIER_REASON_COUNT = 1;
const FAILURE_BARRIER_SUPERSEDED_ROOT_CAUSE_CLASS_SET =
  Object.freeze(new Set([
    ROOT_CAUSE_CLASS_STARTUP,
    ROOT_CAUSE_CLASS_UNKNOWN,
  ]));
const FAILURE_BARRIER_SUPERSEDED_REASON_FRAGMENT_SET = Object.freeze([
  'readiness',
  'snapshot_reachability',
]);
const PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
  'priority_partitions_not_spread';
const CONTROL_PLANE_QUIESCENCE_DISCOVERY_REASON_SET = Object.freeze(new Set([
  CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
  CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
  CONTROL_PLANE_QUIESCENCE_STATE.OBSERVATION_UNAVAILABLE,
  CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
]));
const CONTROL_PLANE_QUIESCENCE_TOPOLOGY_REASON_SET = Object.freeze(new Set([
  CONTROL_PLANE_QUIESCENCE_REASON.OPERATION_DRAIN_STALLED,
  CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
  CONTROL_PLANE_QUIESCENCE_REASON.LEADERSHIP_UNSTABLE,
  CONTROL_PLANE_QUIESCENCE_REASON.CRITICAL_SYSTEM_SPREAD_OPEN,
  CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING,
  CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_STALLED,
  CONTROL_PLANE_QUIESCENCE_STATE.LEADERSHIP_CHURN,
  CONTROL_PLANE_QUIESCENCE_STATE.CRITICAL_SPREAD_OPEN,
]));
const RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING =
  'priority_spread_pending';

function attachCanonicalPublicationEvidence(controlPlane) {
  if (!isRecord(controlPlane)) {
    return null;
  }
  const canonicalControlPlane =
    buildCanonicalControlPlaneDiagnosticsFromControlPlane(controlPlane);
  return {
    ...canonicalControlPlane,
    priorityRecoveryObservation: mergeRetainedPriorityRecoveryObservation(
      canonicalControlPlane?.priorityRecoveryObservation,
      controlPlane.priorityRecoveryObservation,
    ),
  };
}

function mergeControlPlaneDiagnostics(primary, fallback) {
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
    return 'attemptErrors';
  }
  if (marker === FIRST_FAULT_MARKER_HARD_FAILURE) {
    return 'hardLoadFailures';
  }
  return null;
}

function resolveDominantReasonFromFirstFaultTimeline(firstFaultTimeline) {
  const orderedMarkers = Array.isArray(firstFaultTimeline?.orderedMarkers) ?
    firstFaultTimeline.orderedMarkers :
    [];
  if (orderedMarkers.length === ZERO) {
    return null;
  }
  return mapFirstFaultMarkerToReason(orderedMarkers[ZERO].marker);
}


function resolveFinalConsistencyRootCauseClass(finalConsistency) {
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

function resolveStructuredFinalConsistencyFailure(controlPlane) {
  const finalConsistency =
    controlPlane?.finalConsistency &&
    typeof controlPlane.finalConsistency === 'object' &&
    !Array.isArray(controlPlane.finalConsistency) ?
      controlPlane.finalConsistency :
      null;
  if (finalConsistency) {
    const finalConsistencyReason = String(
      finalConsistency.reasonCode ||
        finalConsistency.state ||
        FINAL_CONSISTENCY_REASON_UNCLASSIFIED,
    ).trim();
    return {
      dominantReason: finalConsistencyReason,
      rootCauseClass: resolveFinalConsistencyRootCauseClass({
        ...finalConsistency,
        reasonCode: finalConsistencyReason,
      }),
    };
  }
  const mismatchReason = String(controlPlane?.mismatch?.reasonCode || '').trim();
  if (mismatchReason.length > ZERO) {
    return {
      dominantReason: mismatchReason,
      rootCauseClass: resolveFinalConsistencyRootCauseClass({
        reasonCode: mismatchReason,
      }),
    };
  }
  return null;
}

function resolveLegacyFinalConsistencyFailureFromMessage(entry) {
  const errorMessage = String(entry?.error || '');
  if (errorMessage.includes(FINAL_CONSISTENCY_LEADER_MISMATCH_MESSAGE_PREFIX)) {
    return {
      dominantReason: FINAL_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE,
      rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
    };
  }
  return null;
}

function resolveFinalConsistencyFailure(entry, controlPlane) {
  return (
    resolveStructuredFinalConsistencyFailure(controlPlane) ||
    resolveLegacyFinalConsistencyFailureFromMessage(entry)
  );
}

function resolveControlPlaneQuiescenceRootCauseClass(quiescence) {
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

function resolveStructuredControlPlaneQuiescenceFailure(diagnostics) {
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

function hasOpenPublicationOrPriorityRecoveryBlocker(publicationConvergence) {
  if (!isRecord(publicationConvergence)) {
    return false;
  }
  return (
    publicationConvergence.publicationPending === true ||
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

function resolveActiveGateDominantBlockerReason(publicationConvergence) {
  const blockers = normalizeDistinctStringArray(
    publicationConvergence?.activeGateProgress?.blockers ||
      publicationConvergence?.activeGate?.progress?.blockers,
  );
  return blockers.find(
    (blocker) => blocker !== FAILURE_ARTIFACT_ACTIVE_GATE_READY_BLOCKER,
  ) || null;
}

function resolveDominantReasonOverride({
  existingDominantReason,
  publicationConvergence,
}) {
  const normalizedExistingDominantReason = String(
    existingDominantReason || '',
  ).trim();
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

function filterReasonCountsForClosedPublication({
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

function hasReadyActiveGatePublicationConvergence(publicationConvergence) {
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

function hasClosedPostActiveConvergenceOwners(publicationConvergence) {
  return (
    hasReadyActiveGatePublicationConvergence(publicationConvergence) &&
    !hasOpenPublicationOrPriorityRecoveryBlocker(publicationConvergence)
  );
}

function hasClosedPublicationConvergenceEvidence(publicationConvergence) {
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

function hasConvergenceTimeoutError(entry) {
  return String(entry?.error || '').startsWith(
    FAILURE_BARRIER_ERROR_PREFIX_CONVERGENCE_TIMEOUT,
  );
}

function hasRestartRecoveryTimeoutError(entry) {
  return String(entry?.error || '').startsWith(
    FAILURE_BARRIER_ERROR_PREFIX_RESTART_RECOVERY_TIMEOUT,
  );
}

function isSupersededFailureBarrierRootCause(rootCauseClass) {
  const normalizedRootCauseClass = String(rootCauseClass || '').trim();
  return FAILURE_BARRIER_SUPERSEDED_ROOT_CAUSE_CLASS_SET.has(
    normalizedRootCauseClass,
  );
}

function isSupersededFailureBarrierReason(dominantReason) {
  const normalizedDominantReason = String(dominantReason || '').toLowerCase();
  return FAILURE_BARRIER_SUPERSEDED_REASON_FRAGMENT_SET.some((fragment) =>
    normalizedDominantReason.includes(fragment),
  );
}

function shouldApplyConvergenceFailureBarrier({
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

function hasRestartRecoveryPrioritySpreadEvidence(publicationConvergence) {
  return (
    publicationConvergence?.prioritySpreadPending === true ||
    publicationConvergence?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING ||
    hasPrioritySpreadReasonCode(
      publicationConvergence?.priorityRecoveryReasonCodes,
      publicationConvergence?.reasonCodes,
      publicationConvergence?.reasons,
    )
  );
}

function resolveRestartRecoveryFailureBarrierReason({
  existingFailure,
  publicationConvergence,
}) {
  if (hasRestartRecoveryPrioritySpreadEvidence(publicationConvergence)) {
    return STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING;
  }
  if (isSupersededFailureBarrierReason(existingFailure.dominantReason)) {
    return STABILITY_GATE_BLOCKER_STARTUP_READINESS;
  }
  return FAILURE_BARRIER_REASON_RESTART_RECOVERY_TIMEOUT;
}

function resolveRestartRecoveryFailureBarrier({
  entry,
  existingFailure,
  publicationConvergence,
}) {
  if (!hasRestartRecoveryTimeoutError(entry)) {
    return null;
  }
  return {
    phase: FAILURE_BARRIER_PHASE_RESTART_RECOVERY,
    dominantReason: resolveRestartRecoveryFailureBarrierReason({
      existingFailure,
      publicationConvergence,
    }),
    rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
  };
}

function resolveConvergenceFailureBarrier({
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

function resolveFailureBarrier({
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

function hasPrioritySpreadReasonCode(...reasonLists) {
  return reasonLists
    .flatMap((reasonList) => normalizeDistinctStringArray(reasonList))
    .includes(PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD);
}

function isPrioritySpreadSummarySatisfied(summary) {
  return isRecord(summary) && summary.satisfied === true;
}

function hasSatisfiedPrioritySpreadEvidence({
  decisionClosureWitness,
  publicationConvergence,
  publicationConvergenceGate,
  priorityRecoveryObservation,
}) {
  return (
    decisionClosureWitness?.prioritySpreadPending === false ||
    isPrioritySpreadSummarySatisfied(
      decisionClosureWitness?.refreshedPriorityPartitionSummary,
    ) ||
    isPrioritySpreadSummarySatisfied(
      priorityRecoveryObservation?.priorityPartitionSummary,
    ) ||
    isPrioritySpreadSummarySatisfied(
      publicationConvergenceGate?.priorityPartitionSummary,
    ) ||
    isPrioritySpreadSummarySatisfied(
      publicationConvergence?.priorityPartitionSummary,
    )
  );
}

function hasCompletePriorityRecoveryOperationEvidence(
  priorityRecoveryPartitionWitnesses,
) {
  const witnesses = Array.isArray(priorityRecoveryPartitionWitnesses) ?
    priorityRecoveryPartitionWitnesses :
    [];
  return (
    witnesses.length > ZERO &&
    witnesses.every(
      (witness) =>
        normalizeDistinctStringArray(witness?.operationIds).length > ZERO,
    )
  );
}

function hasActivePrioritySpreadGate({
  decisionClosureWitness,
  publicationConvergence,
  publicationConvergenceGate,
  priorityRecoveryObservation,
  priorityRecoveryPartitionWitnesses,
}) {
  if (
    hasSatisfiedPrioritySpreadEvidence({
      decisionClosureWitness,
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryObservation,
    })
  ) {
    return false;
  }
  if (
    hasCompletePriorityRecoveryOperationEvidence(
      priorityRecoveryPartitionWitnesses,
    )
  ) {
    return false;
  }
  return (
    priorityRecoveryObservation?.prioritySpreadPending === true ||
    publicationConvergenceGate?.prioritySpreadPending === true ||
    publicationConvergence?.prioritySpreadPending === true ||
    priorityRecoveryObservation?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING ||
    publicationConvergenceGate?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING ||
    publicationConvergence?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING ||
    hasPrioritySpreadReasonCode(
      priorityRecoveryObservation?.priorityRecoveryReasonCodes,
      publicationConvergenceGate?.reasonCodes,
      publicationConvergenceGate?.reasons,
      publicationConvergence?.priorityRecoveryReasonCodes,
    )
  );
}

function resolvePriorityRecoveryObservationList(primaryValues, fallbackValues) {
  const primaryList = normalizeDistinctStringArray(primaryValues);
  return primaryList.length > ZERO ?
    primaryList :
    normalizeDistinctStringArray(fallbackValues);
}

function priorityRecoveryPartitionMapHasEntries(partitionMap) {
  return (
    isRecord(partitionMap) &&
    Object.values(partitionMap).some(
      (partitionIds) =>
        normalizeDistinctStringArray(partitionIds).length > ZERO,
    )
  );
}

function resolvePriorityRecoveryObservationMap(primaryMap, fallbackMap) {
  if (priorityRecoveryPartitionMapHasEntries(primaryMap)) {
    return primaryMap;
  }
  return isRecord(fallbackMap) ? fallbackMap : {};
}

function resolvePriorityRecoveryObservationCount(primaryCount, fallbackCount) {
  const primary = normalizeNonNegativeCount(primaryCount);
  return primary > ZERO ? primary : normalizeNonNegativeCount(fallbackCount);
}

function resolvePriorityRecoveryObservationWitnesses(
  primaryWitnesses,
  fallbackWitnesses,
) {
  const primary = normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
    primaryWitnesses,
  );
  return primary.length > ZERO ?
    primary :
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
      fallbackWitnesses,
    );
}

function hasPriorityRecoveryOperationDetail(observation) {
  return (
    normalizeDistinctStringArray(
      observation?.priorityRecoveryProgressClassIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      observation?.priorityRecoverySemanticStateIds,
    ).length > ZERO ||
    normalizeDistinctStringArray(
      observation?.priorityRecoveryUnresolvedPartitionIds,
    ).length > ZERO ||
    priorityRecoveryPartitionMapHasEntries(
      observation?.priorityRecoveryBlockerPartitionIdsByReason,
    ) ||
    priorityRecoveryPartitionMapHasEntries(
      observation?.priorityRecoveryPartitionIdsBySemanticState,
    ) ||
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
      observation?.priorityRecoveryPartitionWitnesses,
    ).length > ZERO
  );
}

function shouldMergeRetainedPriorityRecoveryObservation(
  canonicalObservation,
  sourceObservation,
) {
  if (!isRecord(sourceObservation)) {
    return false;
  }
  if (!isRecord(canonicalObservation)) {
    return true;
  }
  if (
    canonicalObservation.publicationPending !== true &&
    canonicalObservation.prioritySpreadPending !== true
  ) {
    return false;
  }
  return hasPriorityRecoveryOperationDetail(canonicalObservation) !== true;
}

function mergeRetainedPriorityRecoveryObservation(
  canonicalObservation,
  sourceObservation,
) {
  const hasCanonicalObservation = isRecord(canonicalObservation);
  const hasSourceObservation = isRecord(sourceObservation);
  if (!hasSourceObservation) {
    return hasCanonicalObservation ? canonicalObservation : null;
  }
  if (!hasCanonicalObservation) {
    return sourceObservation;
  }
  if (
    shouldMergeRetainedPriorityRecoveryObservation(
      canonicalObservation,
      sourceObservation,
    ) !== true
  ) {
    return canonicalObservation;
  }
  return {
    ...canonicalObservation,
    priorityRecoveryProgressClassIds:
      resolvePriorityRecoveryObservationList(
        canonicalObservation.priorityRecoveryProgressClassIds,
        sourceObservation.priorityRecoveryProgressClassIds,
      ),
    priorityRecoveryProgressClassCount:
      resolvePriorityRecoveryObservationCount(
        canonicalObservation.priorityRecoveryProgressClassCount,
        sourceObservation.priorityRecoveryProgressClassCount,
      ),
    priorityRecoverySemanticStateIds:
      resolvePriorityRecoveryObservationList(
        canonicalObservation.priorityRecoverySemanticStateIds,
        sourceObservation.priorityRecoverySemanticStateIds,
      ),
    priorityRecoverySemanticStateCount:
      resolvePriorityRecoveryObservationCount(
        canonicalObservation.priorityRecoverySemanticStateCount,
        sourceObservation.priorityRecoverySemanticStateCount,
      ),
    priorityRecoveryBlockedPartitionIds:
      resolvePriorityRecoveryObservationList(
        canonicalObservation.priorityRecoveryBlockedPartitionIds,
        sourceObservation.priorityRecoveryBlockedPartitionIds,
      ),
    priorityRecoveryBlockedPartitionCount:
      resolvePriorityRecoveryObservationCount(
        canonicalObservation.priorityRecoveryBlockedPartitionCount,
        sourceObservation.priorityRecoveryBlockedPartitionCount,
      ),
    priorityRecoveryUnresolvedPartitionIds:
      resolvePriorityRecoveryObservationList(
        canonicalObservation.priorityRecoveryUnresolvedPartitionIds,
        sourceObservation.priorityRecoveryUnresolvedPartitionIds,
      ),
    priorityRecoveryUnresolvedPartitionCount:
      resolvePriorityRecoveryObservationCount(
        canonicalObservation.priorityRecoveryUnresolvedPartitionCount,
        sourceObservation.priorityRecoveryUnresolvedPartitionCount,
      ),
    priorityRecoveryBlockerPartitionIdsByReason:
      resolvePriorityRecoveryObservationMap(
        canonicalObservation.priorityRecoveryBlockerPartitionIdsByReason,
        sourceObservation.priorityRecoveryBlockerPartitionIdsByReason,
      ),
    priorityRecoveryPartitionIdsBySemanticState:
      resolvePriorityRecoveryObservationMap(
        canonicalObservation.priorityRecoveryPartitionIdsBySemanticState,
        sourceObservation.priorityRecoveryPartitionIdsBySemanticState,
      ),
    priorityRecoveryPartitionWitnesses:
      resolvePriorityRecoveryObservationWitnesses(
        canonicalObservation.priorityRecoveryPartitionWitnesses,
        sourceObservation.priorityRecoveryPartitionWitnesses,
      ),
  };
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
  const quiescenceFailure =
    resolveStructuredControlPlaneQuiescenceFailure(diagnostics);
  const failureBarrier = resolveFailureBarrier({
    entry,
    existingFailure,
    publicationConvergence,
  });
  const reasonCounts = mergeReasonCounts(
    filterReasonCountsForClosedPublication({
      reasonCounts: existingFailure.reasonCounts,
      publicationConvergence,
    }),
    loadReasonCounts,
    readinessReasonCounts,
    publicationConvergenceReasonCounts,
    quiescenceFailure?.reasonCounts,
  );
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
    reasonCounts[dominantReason] = 1;
  }
  const rootCauseClass = finalConsistencyFailure ?
    finalConsistencyFailure.rootCauseClass :
    quiescenceFailure ?
      quiescenceFailure.rootCauseClass :
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
    return null;
  }

  return {
    ...existingFailure,
    rootCauseClass,
    dominantReason,
    reasonCounts,
    affectedNodeIds,
    ...(failureBarrier ? {failureBarrier} : {}),
    ...(quiescenceFailure ? {quiescence: quiescenceFailure.quiescence} : {}),
  };
}

function buildPublicationConvergenceSummary(controlPlane) {
  const publicationEvidence =
    buildCanonicalPublicationEvidenceFromControlPlane(controlPlane);
  const publicationConvergence = publicationEvidence.publicationConvergence;
  const publicationConvergenceGate =
    publicationEvidence.publicationConvergenceGate;
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
    (controlPlane?.publicationConvergenceGate &&
      typeof controlPlane.publicationConvergenceGate === 'object') ||
    (controlPlane?.activeGateProgress &&
      typeof controlPlane.activeGateProgress === 'object') ||
    (controlPlane?.activeGateBestProgress &&
      typeof controlPlane.activeGateBestProgress === 'object') ||
    (controlPlane?.activeGateNoProgress &&
      typeof controlPlane.activeGateNoProgress === 'object');
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
      blockingReasonCounts[reason] = (blockingReasonCounts[reason] || ZERO) + 1;
    }
  }
  const pendingAckNodeIds = Array.isArray(
    priorityRecoveryObservation?.pendingAckNodeIds,
  ) ?
    priorityRecoveryObservation.pendingAckNodeIds :
    [];
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate:
      priorityRecoveryObservation?.activeGate ||
      controlPlane?.activeGate ||
      null,
    activeGateProgress:
      priorityRecoveryObservation?.activeGateProgress ||
      controlPlane?.activeGateProgress ||
      null,
    activeGateBestProgress:
      priorityRecoveryObservation?.activeGateBestProgress ||
      controlPlane?.activeGateBestProgress ||
      null,
    activeGateNoProgress:
      priorityRecoveryObservation?.activeGateNoProgress ||
      controlPlane?.activeGateNoProgress ||
      null,
    activeGateBlockerHistory:
      priorityRecoveryObservation?.activeGateBlockerHistory ||
      controlPlane?.activeGateBlockerHistory ||
      null,
    activeGateAdmissionState:
      priorityRecoveryObservation?.activeGateAdmissionState ||
      controlPlane?.activeGateAdmissionState ||
      null,
  });
  const activeGateProgress = activeGate?.progress || null;
  const activeGateSnapshotCoverage =
    controlPlane?.activeGateSnapshotCoverage &&
    typeof controlPlane.activeGateSnapshotCoverage === 'object' ?
      controlPlane.activeGateSnapshotCoverage :
      null;
  const activeGateBestProgress = activeGate?.bestProgress || null;
  const activeGateNoProgress =
    priorityRecoveryObservation?.activeGateNoProgress &&
    typeof priorityRecoveryObservation.activeGateNoProgress === 'object' ?
      priorityRecoveryObservation.activeGateNoProgress :
      controlPlane?.activeGateNoProgress &&
          typeof controlPlane.activeGateNoProgress === 'object' ?
        controlPlane.activeGateNoProgress :
        null;
  const activeGateReadinessDelay = normalizeActiveGateReadinessDelay(
    activeGate?.readinessDelay ||
      activeGateNoProgress?.readinessDelay ||
      activeGateProgress?.readinessDelay ||
      activeGateBestProgress?.readinessDelay ||
      activeGateNoProgress?.currentProgress?.readinessDelay ||
      null,
  );
  const activeGateBlockerHistory = Array.isArray(
    activeGate?.blockerHistory,
  ) ?
    activeGate.blockerHistory :
    Array.isArray(
      priorityRecoveryObservation?.activeGateBlockerHistory,
    ) ?
      priorityRecoveryObservation.activeGateBlockerHistory :
      Array.isArray(controlPlane?.activeGateBlockerHistory) ?
        controlPlane.activeGateBlockerHistory :
        [];
  const closureProgressSnapshot =
    activeGateProgress ||
    activeGateBestProgress ||
    activeGateNoProgress?.currentProgress ||
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
          pendingAckNodeIds,
        ) ?
          pendingAckNodeIds.length :
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
    publicationConvergence,
    publicationConvergenceGate,
    readinessMode: activeGate?.mode || activeGateNoProgress?.mode || null,
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
  const allowPriorityRecoveryProgressSummary =
    pendingAckNodeIds.length === ZERO &&
    blockedNodeIds.length === ZERO &&
    activePrioritySpreadGate !== true &&
    (
      controlPlane?.hasExplicitPriorityRecoveryObservation !== true ||
      (
        priorityRecoveryObservation?.publicationPending !== true &&
        publicationConvergenceGate?.publicationPending !== true &&
        publicationConvergenceGate?.prioritySpreadPending !== true
      )
    );
  const priorityRecoveryProgressSummary =
    allowPriorityRecoveryProgressSummary ?
      buildPriorityRecoveryProgressSummary(priorityRecoveryObservation) :
      null;
  const activeGateProgressClasses = isRecord(
    activeGateProgress?.priorityRecoveryProgressClasses,
  ) ?
    activeGateProgress.priorityRecoveryProgressClasses :
    null;
  const pendingAckCount = Math.max(
    pendingAckNodeIds.length,
    normalizeNonNegativeCount(priorityRecoveryObservation?.pendingAckCount),
    normalizeNonNegativeCount(publicationConvergence?.pendingAckCount),
    normalizeNonNegativeCount(publicationConvergenceGate?.pendingAckCount),
    normalizeNonNegativeCount(activeGateProgress?.pendingAckCount),
    normalizeNonNegativeCount(activeGateBestProgress?.pendingAckCount),
  );
  const missingPublishedNodeIds = normalizeDistinctStringArray([
    ...(Array.isArray(publicationConvergenceGate?.missingPublishedNodeIds) ?
      publicationConvergenceGate.missingPublishedNodeIds :
      []),
    ...(Array.isArray(publicationConvergence?.missingPublishedNodeIds) ?
      publicationConvergence.missingPublishedNodeIds :
      []),
    ...(Array.isArray(activeGateProgress?.selectedMissingPublishedNodeIds) ?
      activeGateProgress.selectedMissingPublishedNodeIds :
      []),
    ...(Array.isArray(activeGateBestProgress?.selectedMissingPublishedNodeIds) ?
      activeGateBestProgress.selectedMissingPublishedNodeIds :
      []),
  ]);
  const missingPublishedCount = Math.max(
    missingPublishedNodeIds.length,
    normalizeNonNegativeCount(publicationConvergenceGate?.missingPublishedCount),
    normalizeNonNegativeCount(publicationConvergence?.missingPublishedCount),
    normalizeNonNegativeCount(activeGateProgress?.missingPublishedCount),
    normalizeNonNegativeCount(activeGateBestProgress?.missingPublishedCount),
  );
  return {
    publicationEpoch:
      priorityRecoveryObservation?.publicationEpoch ??
      publicationConvergence?.publicationEpoch ??
      activeGateProgress?.publicationEpoch ??
      activeGateBestProgress?.publicationEpoch ??
      null,
    publicationStatus:
      priorityRecoveryObservation?.publicationStatus ||
      publicationConvergence?.publicationStatus ||
      activeGateProgress?.publicationStatus ||
      activeGateBestProgress?.publicationStatus ||
      null,
    pendingAckNodeIds,
    pendingAckCount,
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
    recoveryProtocolState:
      priorityRecoveryObservation?.recoveryProtocolState ||
      publicationConvergence?.recoveryProtocolState ||
      activeGateProgress?.recoveryProtocolState ||
      activeGateBestProgress?.recoveryProtocolState ||
      null,
    priorityRecoveryReasonCodes:
      priorityRecoveryObservation?.priorityRecoveryReasonCodes ||
      publicationConvergence?.priorityRecoveryReasonCodes ||
      [],
    publicationPending:
      priorityRecoveryObservation?.publicationPending === true,
    prioritySpreadPending: activePrioritySpreadGate === true,
    publicationConvergenceGateReasons:
      priorityRecoveryObservation?.publicationConvergenceGateReasons || [],
    ...(activeGate ? {activeGate} : {}),
    activeGateProgress,
    activeGateBestProgress,
    activeGateNoProgress,
    activeGateReadinessDelay,
    activeGateBlockerHistory,
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
    priorityPartitionSummary:
      priorityRecoveryObservation?.priorityPartitionSummary ||
      decisionClosureWitness?.refreshedPriorityPartitionSummary ||
      priorityRecoveryDecisionSnapshots?.priorityPartitionSummary ||
      null,
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

function collectReadinessReasonCodes(readinessSnapshot) {
  const reasons = Array.isArray(readinessSnapshot?.reasons) ?
    readinessSnapshot.reasons :
    [];
  return reasons
    .map((reason) => String(reason?.code || '').trim())
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
      nodeDiagnostic?.routingDiagnostics?.routingReadinessDimension || '',
    ).trim();
    if (decisionDimension.length === ZERO) {
      continue;
    }
    routingDimensionCounts[decisionDimension] =
      (routingDimensionCounts[decisionDimension] || ZERO) + 1;
    if (decisionDimension === 'repairEligible') {
      repairRoutedNodeIds.push(nodeId);
    } else if (decisionDimension === 'controlPlaneRecoveryEligible') {
      recoveryRoutedNodeIds.push(nodeId);
    }
  }

  const recoveryOnlyNodeIds = [];
  const writeUnhealthyNodeIds = [];
  const publicationBlockedNodeIds = [];
  const readinessByNodeId =
    controlPlane?.readinessByNodeId &&
    typeof controlPlane.readinessByNodeId === 'object' ?
      controlPlane.readinessByNodeId :
      {};

  for (const [nodeId, readiness] of Object.entries(readinessByNodeId)) {
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === 'object' ?
        readiness.dimensions :
        {};
    const repairEligible = dimensions.repairEligible === true;
    const recoveryEligible = dimensions.controlPlaneRecoveryEligible === true;
    if (recoveryEligible && !repairEligible) {
      recoveryOnlyNodeIds.push(nodeId);
    }

    const reasonCodes = collectReadinessReasonCodes(readiness);
    if (reasonCodes.includes('control_plane_write_unhealthy')) {
      writeUnhealthyNodeIds.push(nodeId);
    }
    if (
      reasonCodes.includes('control_plane_publication_pending') ||
      reasonCodes.includes('publishedConvergencePending') ||
      reasonCodes.includes('recovery_eligibility_pending')
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
    if (!readiness || typeof readiness !== 'object') {
      pendingAckBlockedNodeIds.push(nodeId);
      continue;
    }
    const dimensions =
      readiness.dimensions && typeof readiness.dimensions === 'object' ?
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

function hasBlockingPublicationClosureRecord({
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
  const activeGateReady = publicationConvergence?.activeGate?.ready === true;
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
      hasBlockingReadinessFailure(readinessFailure) &&
      (activeGateReady !== true || publicationStillOpen),
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

function isStartupReadinessBlocked({
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

function countRestartBoundaries(logs = null) {
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

function buildConvergenceStabilityGate({
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
    hasBlockingPublicationClosureRecord({
      publicationConvergence,
      readinessFailure,
    })
  ) {
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
  const pendingAckBlockedNodeCount = recoveryReadinessBlocksFailover ?
    rawPendingAckBlockedNodeCount :
    ZERO;
  const publicationBlockedNodeCount = recoveryReadinessBlocksFailover ?
    rawPublicationBlockedNodeCount :
    ZERO;
  const writeUnhealthyNodeCount = recoveryReadinessBlocksFailover ?
    rawWriteUnhealthyNodeCount :
    ZERO;
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
  hasBlockingReadinessFailure,
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
  hasBlockingPublicationClosureRecord,
  isStartupReadinessBlocked,
  countRestartBoundaries,
  buildConvergenceStabilityGate,
  buildFailoverStabilityGate,
};
