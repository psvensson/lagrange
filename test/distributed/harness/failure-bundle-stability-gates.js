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

function buildRestartRecoveryStabilityGate({
  entry,
  controlPlane = null,
  publicationConvergence = null,
  readinessFailure = null,
  failure = null,
  logs = null,
}) {
  const scenarioName = String(entry?.scenario || '')
    .trim()
    .toLowerCase();
  const restartBoundaryCount = countRestartBoundaries(logs);
  const hasStartupReadinessBlocker =
    isStartupReadinessBlocked({
      readinessFailure,
      publicationConvergence,
    });
  const startupRecovery = isRecord(controlPlane?.startupRecovery) ?
    controlPlane.startupRecovery :
    null;
  const terminalRecoveryReadiness = isRecord(
    failure?.failureBarrier?.terminalRecoveryReadiness,
  ) ?
    failure.failureBarrier.terminalRecoveryReadiness :
    null;
  const hasAdminReachabilityBlocker =
    terminalRecoveryReadiness?.ownerState ===
      STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED;
  const applicable =
    scenarioName.includes(SCENARIO_NAME_FRAGMENT_RESTART) ||
    restartBoundaryCount > ZERO ||
    !!startupRecovery ||
    hasStartupReadinessBlocker ||
    hasAdminReachabilityBlocker;
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
    (hasStartupReadinessBlocker &&
      (
        hasMissingActiveNodeBlocker !== true ||
        hasBlockingClosureRecord === true
      )) ||
    startupRecovery?.recoveryBlocked === true
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_STARTUP_READINESS);
  }
  if (hasAdminReachabilityBlocker) {
    blockers.push(STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED);
  }
  if (hasBlockingClosureRecord) {
    blockers.push(STABILITY_GATE_BLOCKER_CLOSURE_RECORD);
  }
  return buildStabilityGate({
    type: STABILITY_GATE_TYPE_RESTART_RECOVERY,
    status:
      blockers.length > ZERO ?
        STABILITY_GATE_STATUS_OPEN :
        STABILITY_GATE_STATUS_CLOSED,
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
      missingPublishedCount: normalizeNonNegativeCount(
        publicationConvergence?.missingPublishedCount,
      ),
      missingPublishedNodeIds: normalizeDistinctStringArray(
        publicationConvergence?.missingPublishedNodeIds,
      ),
      prioritySpreadPending:
        publicationConvergence?.prioritySpreadPending === true,
      closureRecordId: publicationConvergence?.closureRecordId || null,
      closureWitnessClass: publicationConvergence?.closureWitnessClass || null,
      readinessMode: readinessFailure?.mode || null,
      terminalRecoveryReadiness,
    },
  });
}

function buildStabilityGates({
  entry,
  controlPlane = null,
  publicationConvergence = null,
  readinessFailure = null,
  recoveryReadiness = null,
  failure = null,
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
      failure,
      logs,
    }),
  };
}

export {
  buildRestartRecoveryStabilityGate,
  buildStabilityGates,
};
