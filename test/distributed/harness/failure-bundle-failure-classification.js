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
import {FAILURE_BUNDLE_SEGMENT_4} from './failure-bundle-segment-4.js';
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
} = FAILURE_BUNDLE_SEGMENT_4;

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
import {
  appendSignalOnce,
  buildLoadPressureFailureClassification,
  buildPriorityRecoveryProgressFailureClassification,
  hasPriorityRecoveryProgressBlocker,
  hasPriorityRecoverySpreadGap,
  hasPublicationOwnerConvergenceBlocker,
  resolveReadinessPriorityRecoveryBlocker,
} from './failure-bundle-priority-recovery-classification.js';

function appendFailureBarrierSignals(signals, failureBarrier) {
  if (!Array.isArray(signals) || !isRecord(failureBarrier)) {
    return signals;
  }
  const phase = String(failureBarrier.phase || '').trim();
  if (phase.length > ZERO) {
    appendSignalOnce(signals, FAILURE_SIGNAL_FAILURE_BARRIER_PREFIX + phase);
  }
  const dominantReason = String(failureBarrier.dominantReason || '').trim();
  if (dominantReason.length > ZERO) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_FAILURE_BARRIER_REASON_PREFIX + dominantReason,
    );
  }
  return signals;
}

function resolvePostRebalanceClosure(diagnostics) {
  return isRecord(diagnostics?.postRebalanceClosure) ?
    diagnostics.postRebalanceClosure :
    FAILURE_BUNDLE_POST_REBALANCE_CLOSURE_UNAVAILABLE;
}

function hasOpenPostRebalanceClosure(postRebalanceClosure) {
  return (
    isRecord(postRebalanceClosure) &&
    (
      postRebalanceClosure.state === POST_REBALANCE_CLOSURE_STATE.OPEN ||
      (
        Array.isArray(postRebalanceClosure.blockers) &&
        postRebalanceClosure.blockers.length > ZERO
      )
    )
  );
}

function appendPostRebalanceClosureSignals(
  signals,
  postRebalanceClosure,
) {
  if (!Array.isArray(signals) || !isRecord(postRebalanceClosure)) {
    return signals;
  }
  const state = String(postRebalanceClosure.state || '').trim();
  if (state.length > ZERO) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_POST_REBALANCE_CLOSURE_STATE_PREFIX + state,
    );
  }
  const blockers = Array.isArray(postRebalanceClosure.blockers) ?
    postRebalanceClosure.blockers :
    [];
  for (const blocker of blockers) {
    if (!isRecord(blocker)) {
      continue;
    }
    const blockerId = String(blocker.id || '').trim();
    if (blockerId.length > ZERO) {
      appendSignalOnce(
        signals,
        FAILURE_SIGNAL_POST_REBALANCE_BLOCKER_PREFIX + blockerId,
      );
    }
    const dimension = String(blocker.dimension || '').trim();
    if (dimension.length > ZERO) {
      appendSignalOnce(
        signals,
        FAILURE_SIGNAL_POST_REBALANCE_DIMENSION_PREFIX + dimension,
      );
    }
    for (const reasonCode of normalizeDistinctStringArray(
      blocker.reasonCodes,
    )) {
      appendSignalOnce(
        signals,
        FAILURE_SIGNAL_POST_REBALANCE_REASON_PREFIX + reasonCode,
      );
    }
  }
  const softClosures = Array.isArray(postRebalanceClosure.softClosures) ?
    postRebalanceClosure.softClosures :
    [];
  for (const softClosure of softClosures) {
    if (!isRecord(softClosure)) {
      continue;
    }
    const softClosureId = String(softClosure.id || '').trim();
    if (softClosureId.length > ZERO) {
      appendSignalOnce(
        signals,
        FAILURE_SIGNAL_POST_REBALANCE_SOFT_CLOSURE_PREFIX + softClosureId,
      );
    }
  }
  return signals;
}

function buildPostRebalanceClosureFailureClassification({
  postRebalanceClosure,
  dominantReason,
  failureBarrier,
}) {
  const signals = [];
  appendFailureBarrierSignals(signals, failureBarrier);
  appendPostRebalanceClosureSignals(signals, postRebalanceClosure);
  return {
    failureClass: FAILURE_CLASS_TOPOLOGY_UNSTABLE,
    confidence: FAILURE_CLASS_CONFIDENCE_HIGH,
    rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
    dominantReason: dominantReason || null,
    signals,
    postRebalanceClosure,
  };
}

function appendControlPlaneQuiescenceSignals(signals, quiescence) {
  if (!Array.isArray(signals) || !isRecord(quiescence)) {
    return signals;
  }
  const state = String(quiescence.state || '').trim();
  if (state.length > ZERO) {
    appendSignalOnce(signals, FAILURE_SIGNAL_QUIESCENCE_STATE_PREFIX + state);
  }
  const canonicalBlocker = String(quiescence.canonicalBlocker || '').trim();
  if (canonicalBlocker.length > ZERO) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_QUIESCENCE_BLOCKER_PREFIX + canonicalBlocker,
    );
  }
  for (const reasonCode of Array.isArray(quiescence.reasonCodes) ?
    quiescence.reasonCodes :
    []) {
    const normalizedReasonCode = String(reasonCode || '').trim();
    if (normalizedReasonCode.length === ZERO) {
      continue;
    }
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_QUIESCENCE_REASON_PREFIX + normalizedReasonCode,
    );
  }
  const candidateWindowResetReason = String(
    quiescence.candidateWindowReset?.reason || '',
  ).trim();
  if (
    candidateWindowResetReason.length > ZERO &&
    candidateWindowResetReason !==
      CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON.NONE
  ) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_QUIESCENCE_CANDIDATE_WINDOW_RESET_PREFIX +
        candidateWindowResetReason,
    );
  }
  return signals;
}

function resolveFailureClassificationGuidance({
  failureClassification,
  readinessFailureGuidance,
  readinessFailure,
}) {
  const dominantReason = String(
    failureClassification?.dominantReason || '',
  ).trim();
  const normalizedDominantReason = dominantReason.toLowerCase();
  const readinessClassCode = String(readinessFailure?.classCode || '').trim();
  const timeoutShapedDominantReason =
    normalizedDominantReason.includes(TIMEOUT_REASON_FRAGMENT) ||
    normalizedDominantReason.includes(TIMED_OUT_REASON_FRAGMENT);
  const timeoutShapedReadinessFailure =
    readinessClassCode === READINESS_FAILURE_CLASS_SNAPSHOT_TIMEOUT ||
    readinessClassCode === READINESS_FAILURE_CLASS_SNAPSHOT_REACHABILITY_TIMEOUT;
  if (
    failureClassification?.failureClass === FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED &&
    timeoutShapedReadinessFailure === true &&
    dominantReason.length > ZERO &&
    timeoutShapedDominantReason !== true
  ) {
    return {
      failureAction: FAILURE_ACTION_STARTUP_READINESS_BLOCKED,
      operatorRecommendation:
        OPERATOR_RECOMMENDATION_STARTUP_READINESS_BLOCKED,
    };
  }
  if (
    failureClassification?.failureClass ===
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK
  ) {
    return {
      failureAction: FAILURE_ACTION_PRIORITY_RECOVERY_PROGRESS_BLOCKED,
      operatorRecommendation:
        OPERATOR_RECOMMENDATION_PRIORITY_RECOVERY_PROGRESS_BLOCKED,
    };
  }
  if (
    failureClassification?.failureClass === FAILURE_CLASS_LOAD_PRESSURE &&
    !readinessFailureGuidance?.failureAction
  ) {
    return {
      failureAction: FAILURE_ACTION_LOAD_PRESSURE,
      operatorRecommendation: OPERATOR_RECOMMENDATION_LOAD_PRESSURE,
    };
  }
  if (
    failureClassification?.failureClass === FAILURE_CLASS_TOPOLOGY_UNSTABLE &&
    hasOpenPostRebalanceClosure(failureClassification?.postRebalanceClosure)
  ) {
    return {
      failureAction: FAILURE_ACTION_POST_REBALANCE_CLOSURE_OPEN,
      operatorRecommendation:
        OPERATOR_RECOMMENDATION_POST_REBALANCE_CLOSURE_OPEN,
    };
  }
  if (
    failureClassification?.failureClass === FAILURE_CLASS_TOPOLOGY_UNSTABLE &&
    failureClassification?.dominantReason ===
      FAILURE_REASON_CONVERGENCE_TIMEOUT
  ) {
    return {
      failureAction: FAILURE_ACTION_POST_ACTIVE_CONVERGENCE_TIMEOUT,
      operatorRecommendation:
        OPERATOR_RECOMMENDATION_POST_ACTIVE_CONVERGENCE_TIMEOUT,
    };
  }
  return isRecord(readinessFailureGuidance) ?
    readinessFailureGuidance :
    FAILURE_GUIDANCE_EMPTY;
}

function collectLatestDecisionArtifact(logs, fieldName) {
  const artifacts = Object.values(logs?.decisionArtifactsByNodeId || {})
    .map((artifact) => artifact?.[fieldName] || null)
    .filter(Boolean);
  return selectLatestTimestampedArtifact(artifacts);
}

function selectLatestTimestampedArtifact(artifacts) {
  const normalizedArtifacts = Array.isArray(artifacts) ?
    artifacts.filter(Boolean) :
    [];
  if (normalizedArtifacts.length === ZERO) {
    return null;
  }
  return normalizedArtifacts
    .slice()
    .sort((left, right) => {
      const leftTimeMs = Date.parse(left?.timestamp || UNKNOWN_VALUE);
      const rightTimeMs = Date.parse(right?.timestamp || UNKNOWN_VALUE);
      const normalizedLeftTimeMs = Number.isFinite(leftTimeMs) ?
        leftTimeMs :
        ZERO;
      const normalizedRightTimeMs = Number.isFinite(rightTimeMs) ?
        rightTimeMs :
        ZERO;
      return normalizedLeftTimeMs - normalizedRightTimeMs;
    })
    .at(ARRAY_LAST_INDEX) || null;
}

function resolveStartupOwnerEvidenceState(snapshot) {
  if (
    snapshot.phase === JOINING_PHASE.CONTACTING_SEED &&
    isRecord(snapshot.latestRetryableJoinResume)
  ) {
    return STARTUP_OWNER_EVIDENCE_STATE.SEED_CONTACT_RETRYING;
  }
  return STARTUP_OWNER_EVIDENCE_STATE.UNCLASSIFIED;
}

function buildStartupOwnerEvidence(logs) {
  const latestRetryableJoinResume = collectLatestDecisionArtifact(
    logs,
    DECISION_ARTIFACT_LATEST_FIELD.RETRYABLE_JOIN_RESUME,
  );
  const latestStartupFailure = collectLatestDecisionArtifact(
    logs,
    DECISION_ARTIFACT_LATEST_FIELD.STARTUP_FAILURE,
  );
  const phase = String(
    latestRetryableJoinResume?.phase ||
      latestStartupFailure?.phase ||
      '',
  ).trim();
  const snapshot = {
    phase,
    latestRetryableJoinResume,
    latestStartupFailure,
    retryAfterMs: normalizeNonNegativeCount(
      latestRetryableJoinResume?.retryAfterMs,
    ),
  };
  const evidenceState = resolveStartupOwnerEvidenceState(snapshot);
  const evidenceTemplate = STARTUP_OWNER_EVIDENCE_BY_STATE[evidenceState] ||
    null;
  if (!evidenceTemplate) {
    return null;
  }
  return {
    ...evidenceTemplate,
    phase: snapshot.phase,
    retryAfterMs: snapshot.retryAfterMs,
    latestRetryableJoinResume,
    latestStartupFailure,
  };
}

function appendStartupOwnerEvidenceSignals(
  signals,
  startupOwnerEvidence,
  readinessDominantReason,
) {
  if (!startupOwnerEvidence) {
    return;
  }
  appendSignalOnce(
    signals,
    FAILURE_SIGNAL_STARTUP_OWNER_PREFIX + startupOwnerEvidence.owner,
  );
  if (startupOwnerEvidence.phase) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_STARTUP_PHASE_PREFIX + startupOwnerEvidence.phase,
    );
  }
  if (startupOwnerEvidence.retryAfterMs !== null) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_STARTUP_RETRY_AFTER_MS_PREFIX +
        String(startupOwnerEvidence.retryAfterMs),
    );
  }
  if (readinessDominantReason) {
    appendSignalOnce(
      signals,
      FAILURE_SIGNAL_STARTUP_READINESS_REASON_PREFIX +
        readinessDominantReason,
    );
  }
}

function buildFailureClassification({
  failure,
  controlPlane,
  readiness,
  logs,
  postRebalanceClosure = FAILURE_BUNDLE_POST_REBALANCE_CLOSURE_UNAVAILABLE,
}) {
  const signals = [];
  const dominantReason = String(failure?.dominantReason || '').trim();
  const rootCauseClass = String(failure?.rootCauseClass || '').trim();
  appendFailureBarrierSignals(signals, failure?.failureBarrier);
  appendControlPlaneQuiescenceSignals(signals, failure?.quiescence);
  const publicationConvergence =
    buildPublicationConvergenceSummary(controlPlane);
  const readinessFailure = resolveReadinessFailure(controlPlane);
  const startupRecovery =
    controlPlane?.startupRecovery &&
    typeof controlPlane.startupRecovery === 'object' ?
      controlPlane.startupRecovery :
      null;
  const latestStartupDecision = collectLatestDecisionArtifact(
    logs,
    DECISION_ARTIFACT_LATEST_FIELD.STARTUP_DECISION,
  );
  const startupOwnerEvidence = buildStartupOwnerEvidence(logs);
  const dominantProgressWitness =
    publicationConvergence?.priorityRecoveryProgressSummary?.dominantWitness &&
    isRecord(publicationConvergence.priorityRecoveryProgressSummary.dominantWitness) ?
      publicationConvergence.priorityRecoveryProgressSummary.dominantWitness :
      null;
  const readinessPriorityRecoveryBlocker =
    resolveReadinessPriorityRecoveryBlocker(controlPlane);
  const hasPriorityRecoveryProgressBlockerEvidence =
    hasPriorityRecoveryProgressBlocker(publicationConvergence);
  const hasPriorityRecoveryOwnerProgressContract =
    hasPriorityRecoveryProgressBlockerEvidence &&
    hasMeaningfulPriorityRecoveryProgressWitness(dominantProgressWitness);
  const hasPriorityRecoveryCountOnlyBlockerAfterSpreadClosure =
    hasPriorityRecoveryProgressBlockerEvidence &&
    hasPriorityRecoveryOwnerProgressContract !== true &&
    hasPriorityRecoverySpreadGap(publicationConvergence) !== true;
  const hasPriorityRecoveryFailureBarrier =
    hasPriorityRecoveryProgressBlockerEvidence &&
    failure?.failureBarrier?.phase === STABILITY_GATE_TYPE_RESTART_RECOVERY &&
    failure?.failureBarrier?.dominantReason ===
      STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING;
  const hasPriorityRecoveryOwnerBlocker =
    hasPriorityRecoveryOwnerProgressContract ||
    hasPriorityRecoveryCountOnlyBlockerAfterSpreadClosure ||
    hasPriorityRecoveryFailureBarrier ||
    Boolean(readinessPriorityRecoveryBlocker);
  const hasStartupReadinessBlocker =
    isStartupReadinessBlocked({
      readinessFailure,
      publicationConvergence,
    });
  const hasBlockingClosureRecord = hasBlockingPublicationClosureRecord({
    publicationConvergence,
    readinessFailure,
  });
  const hasPostRebalanceClosureBlocker =
    hasOpenPostRebalanceClosure(postRebalanceClosure);

  if (isRecord(failure?.quiescence)) {
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
  }

  if (
    hasPublicationOwnerConvergenceBlocker({
      publicationConvergence,
      hasStartupReadinessBlocker,
      hasBlockingClosureRecord,
      hasPriorityRecoveryOwnerBlocker,
    })
  ) {
    appendActiveGateReadinessDelaySignals(
      signals,
      publicationConvergence.activeGateReadinessDelay,
    );
    appendReadinessFailureSignals(signals, readinessFailure);
    signals.push(
      FAILURE_SIGNAL_PENDING_ACK_COUNT_PREFIX +
        String(publicationConvergence.pendingAckCount),
      FAILURE_SIGNAL_BLOCKED_NODE_COUNT_PREFIX +
        String(publicationConvergence.blockedNodeCount),
      FAILURE_SIGNAL_MISSING_PUBLISHED_COUNT_PREFIX +
        String(publicationConvergence.missingPublishedCount || ZERO),
    );
    const missingPublishedNodeIds = normalizeDistinctStringArray(
      publicationConvergence.missingPublishedNodeIds,
    );
    if (missingPublishedNodeIds.length > ZERO) {
      signals.push(
        FAILURE_SIGNAL_MISSING_PUBLISHED_NODE_IDS_PREFIX +
          missingPublishedNodeIds.join(FAILURE_SIGNAL_VALUE_SEPARATOR),
      );
    }
    if (
      typeof publicationConvergence.recoveryProtocolState === 'string' &&
      publicationConvergence.recoveryProtocolState.length > ZERO
    ) {
      signals.push(
        FAILURE_SIGNAL_RECOVERY_PROTOCOL_STATE_PREFIX +
          publicationConvergence.recoveryProtocolState,
      );
    }
    if (publicationConvergence.prioritySpreadPending === true) {
      signals.push(FAILURE_SIGNAL_PRIORITY_SPREAD_PENDING);
    }
    if (
      Number(publicationConvergence.priorityRecoveryProgressClassCount) > ZERO
    ) {
      signals.push(
        FAILURE_SIGNAL_PRIORITY_RECOVERY_PROGRESS_CLASS_COUNT_PREFIX +
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
        FAILURE_SIGNAL_PRIORITY_RECOVERY_FAILING_INVARIANTS_PREFIX +
          publicationConvergence.priorityRecoveryInvariantFailingIds.join(
            FAILURE_SIGNAL_VALUE_SEPARATOR,
          ),
      );
    }
    if (
      typeof publicationConvergence.closureRecordId === 'string' &&
      publicationConvergence.closureRecordId.length > ZERO
    ) {
      signals.push(
        FAILURE_SIGNAL_CLOSURE_RECORD_ID_PREFIX +
          publicationConvergence.closureRecordId,
      );
    }
    if (
      typeof publicationConvergence.closureWitnessClass === 'string' &&
      publicationConvergence.closureWitnessClass.length > ZERO
    ) {
      signals.push(
        FAILURE_SIGNAL_CLOSURE_WITNESS_CLASS_PREFIX +
          publicationConvergence.closureWitnessClass,
      );
    }
    if (dominantProgressWitness?.partitionId) {
      signals.push(
        FAILURE_SIGNAL_PRIORITY_RECOVERY_PARTITION_PREFIX +
          dominantProgressWitness.partitionId,
      );
    }
    if (dominantProgressWitness?.currentOwner) {
      signals.push(
        FAILURE_SIGNAL_PRIORITY_RECOVERY_OWNER_PREFIX +
          dominantProgressWitness.currentOwner,
      );
    }
    if (dominantProgressWitness?.blockingBoundary) {
      signals.push(
        FAILURE_SIGNAL_PRIORITY_RECOVERY_BOUNDARY_PREFIX +
          dominantProgressWitness.blockingBoundary,
      );
    }
    if (dominantProgressWitness?.waitMode) {
      signals.push(
        FAILURE_SIGNAL_PRIORITY_RECOVERY_WAIT_MODE_PREFIX +
          dominantProgressWitness.waitMode,
      );
    }
    if (dominantProgressWitness?.nextRequiredAction) {
      signals.push(
        FAILURE_SIGNAL_PRIORITY_RECOVERY_NEXT_ACTION_PREFIX +
          dominantProgressWitness.nextRequiredAction,
      );
    }
    return {
      failureClass: FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      confidence: FAILURE_CLASS_CONFIDENCE_HIGH,
      rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (hasPostRebalanceClosureBlocker) {
    return buildPostRebalanceClosureFailureClassification({
      postRebalanceClosure,
      dominantReason,
      failureBarrier: failure?.failureBarrier,
    });
  }

  if (hasPriorityRecoveryOwnerBlocker) {
    return buildPriorityRecoveryProgressFailureClassification({
      publicationConvergence,
      rootCauseClass,
      dominantReason,
      dominantProgressWitness,
      readinessPriorityRecoveryBlocker,
      failureBarrier: failure?.failureBarrier,
    });
  }

  if (
    startupRecovery?.recoveryBlocked === true ||
    rootCauseClass === ROOT_CAUSE_CLASS_STARTUP
  ) {
    if (startupRecovery?.recoveryStage) {
      signals.push('recoveryStage=' + startupRecovery.recoveryStage);
    }
    if (latestStartupDecision?.startupMode) {
      signals.push('startupMode=' + latestStartupDecision.startupMode);
    }
    appendStartupOwnerEvidenceSignals(
      signals,
      startupOwnerEvidence,
      dominantReason,
    );
    return {
      failureClass: FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      confidence:
        startupRecovery?.recoveryBlocked === true ?
          FAILURE_CLASS_CONFIDENCE_HIGH :
          FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_STARTUP,
      dominantReason:
        startupOwnerEvidence?.reasonCode ||
        dominantReason ||
        null,
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
    return buildLoadPressureFailureClassification({
      rootCauseClass,
      dominantReason,
      dominantProgressWitness,
    });
  }

  if (
    rootCauseClass === ROOT_CAUSE_CLASS_CDC ||
    dominantReason.includes('cdc')
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
    dominantReason.includes('cache')
  ) {
    return {
      failureClass: FAILURE_CLASS_CACHE_STALE,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_CACHE,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === 'verify') {
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
      'readinessReasons=' + readinessReasons.slice(ZERO, 3).join('|'),
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

export {
  appendControlPlaneQuiescenceSignals,
  appendFailureBarrierSignals,
  appendPostRebalanceClosureSignals,
  appendStartupOwnerEvidenceSignals,
  buildFailureClassification,
  buildPostRebalanceClosureFailureClassification,
  buildStartupOwnerEvidence,
  collectLatestDecisionArtifact,
  hasOpenPostRebalanceClosure,
  resolveFailureClassificationGuidance,
  resolvePostRebalanceClosure,
  resolveStartupOwnerEvidenceState,
  selectLatestTimestampedArtifact,
};
