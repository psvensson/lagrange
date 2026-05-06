import {
  classifyActiveGateClosureWitness,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
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
import {
  RECOVERY_PROTOCOL_STATE,
} from '../../../src/control-plane/membership-lifecycle-constants.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_REASON,
} from '../../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
} from '../../../src/control-plane/priority-recovery-snapshot.js';
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
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACK_NODES,
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

const PRIORITY_RECOVERY_WORKFLOW_PROGRESS_ACTUATION_STATES = Object.freeze([
  PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
  PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
]);
const EMPTY_STRING = '';
const ONE = 1;
const JS_OBJECT_TYPE = 'object';
const PRIORITY_RECOVERY_WITNESS_FRESHNESS_KEY_SEPARATOR = '|';
const LOAD_WAIT_REASON_ATTEMPT_ERRORS = 'attemptErrors';
const LOAD_WAIT_REASON_HARD_LOAD_FAILURES = 'hardLoadFailures';
const READINESS_DIMENSION_REPAIR_ELIGIBLE = 'repairEligible';
const READINESS_DIMENSION_CONTROL_PLANE_RECOVERY_ELIGIBLE =
  'controlPlaneRecoveryEligible';
const READINESS_REASON_CONTROL_PLANE_WRITE_UNHEALTHY =
  'control_plane_write_unhealthy';
const READINESS_REASON_CONTROL_PLANE_PUBLICATION_PENDING =
  'control_plane_publication_pending';
const READINESS_REASON_PUBLISHED_CONVERGENCE_PENDING =
  'publishedConvergencePending';
const READINESS_REASON_RECOVERY_ELIGIBILITY_PENDING =
  'recovery_eligibility_pending';
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
const FAILURE_ARTIFACT_PUBLICATION_GATE_BLOCKER_PREFIX = 'publication_gate=';
const FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX =
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=';
const FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_BLOCKER_PREFIX =
  'snapshot_coverage=';
const FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_SEPARATOR = '/';
const PUBLICATION_MISSING_PUBLISHED_ACTIVE_GATE_SELECTION_STATE =
  Object.freeze({
    ABSENT: 'absent',
    CURRENT: 'current',
  });
const PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE = Object.freeze({
  SUPPRESSED_DURING_PRIORITY_ACTUATION:
    'suppressed_during_priority_actuation',
  SUPPRESSED_STALE_CLOSURE_DURING_COVERAGE_LAG:
    'suppressed_stale_closure_during_coverage_lag',
  CANONICAL_DURING_COVERAGE_LAG: 'canonical_during_coverage_lag',
  CURRENT_ACTIVE_GATE_SELECTED: 'current_active_gate_selected',
  MERGED_CURRENT_EVIDENCE: 'merged_current_evidence',
});
const PUBLICATION_MISSING_PUBLISHED_EVIDENCE_RULES = Object.freeze([
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
        .SUPPRESSED_DURING_PRIORITY_ACTUATION,
    matches: (evidence) =>
      evidence.activeGateSnapshotCoveragePending === true &&
      evidence.activeGatePriorityRecoveryActuationEvidenceOpen === true &&
      evidence.hasExplicitPriorityRecoveryObservation === true &&
      evidence.hasCoverageCanonicalMissingActiveNodeGateDebt !== true,
    select: () => Object.freeze({
      nodeIds: [],
      count: ZERO,
    }),
  }),
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
        .SUPPRESSED_STALE_CLOSURE_DURING_COVERAGE_LAG,
    matches: (evidence) =>
      evidence.activeGateSnapshotCoveragePending === true &&
      evidence.stalePublicationClosureEvidence === true &&
      evidence.rawCoverageCanonicalEvidenceAvailable === true &&
      evidence.hasCoverageCanonicalMissingActiveNodeGateDebt !== true,
    select: () => Object.freeze({
      nodeIds: [],
      count: ZERO,
    }),
  }),
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
        .CANONICAL_DURING_COVERAGE_LAG,
    matches: (evidence) =>
      evidence.activeGateSnapshotCoveragePending === true,
    select: (evidence) => Object.freeze({
      nodeIds: evidence.coverageCanonicalNodeIds,
      count: evidence.coverageCanonicalCount,
    }),
  }),
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
        .CURRENT_ACTIVE_GATE_SELECTED,
    matches: (evidence) =>
      evidence.activeGateSelectedEvidence.state ===
        PUBLICATION_MISSING_PUBLISHED_ACTIVE_GATE_SELECTION_STATE.CURRENT,
    select: (evidence) => Object.freeze({
      nodeIds: evidence.activeGateSelectedEvidence.nodeIds,
      count: evidence.activeGateSelectedEvidence.nodeIds.length,
    }),
  }),
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE.MERGED_CURRENT_EVIDENCE,
    matches: () => true,
    select: (evidence) => Object.freeze({
      nodeIds: evidence.mergedNodeIds,
      count: evidence.mergedCount,
    }),
  }),
]);
const FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET = Object.freeze(new Set([
  'control_plane_publication_pending',
  'publishedConvergencePending',
  'recovery_eligibility_pending',
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
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
const RESTART_RECOVERY_READINESS_FIELD_SEPARATOR = ', ';
const RESTART_RECOVERY_READINESS_FIELD_VALUE_SEPARATOR = '=';
const RESTART_RECOVERY_READINESS_NODE_MARKER = ' for node ';
const RESTART_RECOVERY_READINESS_OBSERVATION_START_MARKER = ' (';
const RESTART_RECOVERY_READINESS_OBSERVATION_END_MARKER = ')';
const RESTART_RECOVERY_READINESS_BOOLEAN_TRUE = 'true';
const RESTART_RECOVERY_READINESS_BOOLEAN_FALSE = 'false';
const RESTART_RECOVERY_READINESS_NO_VALUE = 'none';
const RESTART_RECOVERY_READINESS_UNKNOWN_VALUE = 'unknown';
const RESTART_RECOVERY_READINESS_ADMIN_REFUSED_FRAGMENT = 'econnrefused';
const RESTART_RECOVERY_READINESS_REACHABLE_BY_BOOTSTRAP_HEALTH =
  'bootstrap_health';
const RESTART_RECOVERY_READINESS_FIELD = Object.freeze({
  REACHABLE: 'reachable',
  READY: 'ready',
  ADMIN_READY: 'adminReady',
  CONTROL_PLANE_RECOVERY_READY: 'controlPlaneRecoveryReady',
  PUBLISHED_CONTROL_PLANE_EPOCH: 'publishedControlPlaneEpoch',
  EXPECTED_PUBLICATION_EPOCH: 'expectedPublicationEpoch',
  READINESS_PHASE: 'readinessPhase',
  READINESS_STAGE: 'readinessStage',
  READINESS_STAGE_RANK: 'readinessStageRank',
  READINESS_REASONS: 'readinessReasons',
  RECOVERY_STAGE: 'recoveryStage',
  BOOTSTRAP_JOIN_PROJECTION_BLOCKER: 'bootstrapJoinProjectionBlocker',
  BOOTSTRAP_JOIN_PROJECTION_RULE: 'bootstrapJoinProjectionRule',
  REACHABLE_BY: 'reachableBy',
  LAST_ERROR: 'lastError',
});
const CONTROL_PLANE_QUIESCENCE_DISCOVERY_REASON_SET = Object.freeze(new Set([
  CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
  CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
  CONTROL_PLANE_QUIESCENCE_REASON.DISCOVERY_REPAIR_TIMEOUT,
  CONTROL_PLANE_QUIESCENCE_REASON.NODE_STATE_PUBLICATION_PRESSURE,
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
  CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
]));

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

function mergePriorityRecoveryObservationSnapshots(primaryObservation, fallbackObservation) {
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
    return LOAD_WAIT_REASON_ATTEMPT_ERRORS;
  }
  if (marker === FIRST_FAULT_MARKER_HARD_FAILURE) {
    return LOAD_WAIT_REASON_HARD_LOAD_FAILURES;
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

function resolvePublicationBlockedDominantReason(publicationConvergence) {
  if (!isRecord(publicationConvergence)) {
    return null;
  }
  if (normalizeNonNegativeCount(publicationConvergence.pendingAckCount) > ZERO) {
    return STABILITY_GATE_BLOCKER_PENDING_ACK_NODES;
  }
  if (normalizeNonNegativeCount(publicationConvergence.blockedNodeCount) > ZERO) {
    return STABILITY_GATE_BLOCKER_BLOCKED_NODES;
  }
  if (publicationConvergence.publicationPending === true) {
    return STABILITY_GATE_BLOCKER_PUBLICATION_PENDING;
  }
  return null;
}

function normalizeActiveGateBlockerReason(reason) {
  const normalizedReason = String(reason || '').trim();
  return normalizedReason.startsWith(
    FAILURE_ARTIFACT_PUBLICATION_GATE_BLOCKER_PREFIX,
  ) ?
    normalizedReason.slice(
      FAILURE_ARTIFACT_PUBLICATION_GATE_BLOCKER_PREFIX.length,
    ) :
    normalizedReason;
}

function isPublicationMissingActiveNodeReason(reason) {
  return normalizeActiveGateBlockerReason(reason).startsWith(
    FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX,
  );
}

function resolvePublicationMissingActiveNodeReasonNodeIds(reasonSources = []) {
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

function resolveActiveGateSnapshotCoverageBlocker(progress = null) {
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

function hasActiveGateSnapshotCoveragePending(publicationConvergence) {
  const progress =
    publicationConvergence?.activeGateProgress ||
    publicationConvergence?.activeGate?.progress ||
    null;
  return resolveActiveGateSnapshotCoverageBlocker(progress) !== null;
}

function collectPublicationMissingActiveNodeReasonCandidates(
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

function resolvePublicationMissingActiveNodeReason(publicationConvergence) {
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

function hasPublicationMissingActiveNodeBlocker(publicationConvergence) {
  return resolvePublicationMissingActiveNodeReason(publicationConvergence) !==
    null;
}

function resolveActiveGateDominantBlockerReason(publicationConvergence) {
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

function resolveDominantReasonOverride({
  existingDominantReason,
  publicationConvergence,
}) {
  const missingActiveNodeReason = resolvePublicationMissingActiveNodeReason(
    publicationConvergence,
  );
  if (missingActiveNodeReason) {
    return missingActiveNodeReason;
  }
  const currentPublicationBlockedReason =
    resolvePublicationBlockedDominantReason(publicationConvergence);
  if (currentPublicationBlockedReason) {
    return currentPublicationBlockedReason;
  }
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

function filterReasonCountsForPublicationMissingActiveNode({
  reasonCounts,
  publicationConvergence,
}) {
  if (!isRecord(reasonCounts)) {
    return reasonCounts;
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
  return String(entry?.error || EMPTY_STRING).startsWith(
    FAILURE_BARRIER_ERROR_PREFIX_CONVERGENCE_TIMEOUT,
  );
}

function hasRestartRecoveryTimeoutError(entry) {
  return String(entry?.error || EMPTY_STRING).startsWith(
    FAILURE_BARRIER_ERROR_PREFIX_RESTART_RECOVERY_TIMEOUT,
  );
}

function normalizeRestartRecoveryReadinessFieldValue(value) {
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

function normalizeRestartRecoveryReadinessNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.floor(numericValue) : null;
}

function parseRestartRecoveryReadinessFieldMap(observationText) {
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

function isRestartRecoveryAdminReachabilityRefused(lastError) {
  return String(lastError || EMPTY_STRING)
    .toLowerCase()
    .includes(RESTART_RECOVERY_READINESS_ADMIN_REFUSED_FRAGMENT);
}

function resolveRestartRecoveryReadinessOwnerState(observation) {
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

function resolveRestartRecoveryReadinessObservation(entry) {
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

function resolveRestartRecoveryFailureBarrierReason({
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

function resolveRestartRecoveryFailureBarrierRootCauseClass(dominantReason) {
  if (dominantReason === STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  return ROOT_CAUSE_CLASS_STARTUP;
}

function resolveRestartRecoveryFailureBarrier({
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
      RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING ||
    publicationConvergenceGate?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING ||
    publicationConvergence?.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING ||
    hasPrioritySpreadReasonCode(
      priorityRecoveryObservation?.priorityRecoveryReasonCodes,
      publicationConvergenceGate?.reasonCodes,
      publicationConvergenceGate?.reasons,
      publicationConvergence?.priorityRecoveryReasonCodes,
    )
  );
}

function buildPriorityRecoveryActuationWitnessEvidence(witness) {
  const progressClassIds = normalizeDistinctStringArray([
    ...(Array.isArray(witness?.progressClassIds) ?
      witness.progressClassIds :
      []),
    ...(Array.isArray(witness?.blockerReasonCodes) ?
      witness.blockerReasonCodes :
      []),
    ...(Array.isArray(witness?.blockerReasons) ?
      witness.blockerReasons :
      []),
  ]);
  const semanticStateIds = normalizeDistinctStringArray([
    witness?.semanticStateId,
    witness?.semanticState,
  ]);
  const ownerIds = normalizeDistinctStringArray([
    witness?.currentOwner,
    witness?.actuationOwner,
    witness?.owner,
  ]);
  return Object.freeze({
    progressClass:
      progressClassIds.includes(
        PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
      ),
    semanticState:
      semanticStateIds.includes(
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      ),
    owner:
      ownerIds.includes(PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER),
    boundary:
      witness?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
    nextAction:
      witness?.nextRequiredAction ===
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
    operationWorkflowProgress:
      ownerIds.includes(
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      ) &&
      witness?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
      witness?.nextRequiredAction ===
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS &&
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_ACTUATION_STATES.includes(
        witness?.actuationState,
      ),
    actuationState:
      witness?.actuationState ===
        PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
  });
}

function buildActiveGatePriorityRecoveryActuationEvidence({
  priorityRecoveryObservation = null,
  priorityRecoveryPartitionWitnesses = [],
  activeGateProgressClasses = null,
} = {}) {
  const observationProgressClassIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoveryProgressClassIds,
  );
  const activeGateProgressClassIds = normalizeDistinctStringArray(
    activeGateProgressClasses?.unresolvedClassIds,
  );
  const observationSemanticStateIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoverySemanticStateIds,
  );
  const activeGateSemanticStateIds = normalizeDistinctStringArray(
    activeGateProgressClasses?.unresolvedSemanticStateIds,
  );
  const witnessEvidence = (
    Array.isArray(priorityRecoveryPartitionWitnesses) ?
      priorityRecoveryPartitionWitnesses :
      []
  ).map(buildPriorityRecoveryActuationWitnessEvidence);
  const witnessProgressClass = witnessEvidence.some(
    (witness) => witness.progressClass === true,
  );
  const witnessOperationWorkflowProgress = witnessEvidence.some(
    (witness) => witness.operationWorkflowProgress === true,
  );
  const witnessOperationCreationRequired = witnessEvidence.some(
    (witness) =>
      witness.progressClass === true &&
      witness.semanticState === true &&
      witness.owner === true &&
      witness.boundary === true &&
      witness.nextAction === true &&
      witness.actuationState === true,
  );
  return Object.freeze({
    progressClassIds:
      observationProgressClassIds.includes(
        PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
      ) ||
      activeGateProgressClassIds.includes(
        PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
      ) ||
      witnessEvidence.some((witness) => witness.progressClass),
    semanticStateIds:
      observationSemanticStateIds.includes(
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      ) ||
      activeGateSemanticStateIds.includes(
        PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      ) ||
      witnessEvidence.some((witness) => witness.semanticState),
    activeGateClassContract:
      activeGateProgressClassIds.length > ZERO &&
      activeGateSemanticStateIds.length > ZERO,
    witnessOperationCreationRequired:
      witnessEvidence.some((witness) =>
        witness.progressClass === true &&
        witness.semanticState === true &&
        witness.owner === true &&
        witness.boundary === true &&
        witness.nextAction === true &&
        witness.actuationState === true,
      ),
    witnessOperationWorkflowProgress,
    witnessProgressClass,
    isOpen:
      (activeGateProgressClassIds.length > ZERO &&
        activeGateSemanticStateIds.length > ZERO) ||
      witnessProgressClass ||
      witnessOperationCreationRequired ||
      witnessOperationWorkflowProgress,
  });
}

function hasActiveGatePriorityRecoveryActuationEvidence(input) {
  const evidence = buildActiveGatePriorityRecoveryActuationEvidence(input);
  return evidence.isOpen === true;
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

function dedupePriorityRecoveryObservationWitnesses(witnesses) {
  const witnessByKey = new Map();
  for (const witness of witnesses) {
    const witnessKey = JSON.stringify(witness);
    if (!witnessByKey.has(witnessKey)) {
      witnessByKey.set(witnessKey, witness);
    }
  }
  return [...witnessByKey.values()];
}

function buildPriorityRecoveryWitnessFreshnessKey(witness) {
  const operationIds = normalizeDistinctStringArray(witness?.operationIds)
    .sort();
  if (operationIds.length > ZERO) {
    return operationIds.join(PRIORITY_RECOVERY_WITNESS_FRESHNESS_KEY_SEPARATOR);
  }
  const correlationKey = String(witness?.correlationKey || EMPTY_STRING).trim();
  return correlationKey.length > ZERO ? correlationKey : EMPTY_STRING;
}

function resolvePriorityRecoveryWitnessFreshnessAtMs(witness) {
  const lastProgressAtMs = normalizeNonNegativeCount(witness?.lastProgressAtMs);
  if (lastProgressAtMs > ZERO) {
    return lastProgressAtMs;
  }
  const snapshotCapturedAt = normalizeNonNegativeCount(
    witness?.snapshotCapturedAt,
  );
  return snapshotCapturedAt > ZERO ? snapshotCapturedAt : null;
}

function resolveFreshRetainedPriorityRecoveryObservationWitnesses(
  canonicalWitnesses,
  sourceWitnesses,
) {
  const canonical = normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
    canonicalWitnesses,
  );
  const canonicalFreshnessByKey = new Map();
  for (const canonicalWitness of canonical) {
    const freshnessKey = buildPriorityRecoveryWitnessFreshnessKey(
      canonicalWitness,
    );
    if (freshnessKey.length === ZERO) {
      continue;
    }
    canonicalFreshnessByKey.set(
      freshnessKey,
      resolvePriorityRecoveryWitnessFreshnessAtMs(canonicalWitness),
    );
  }
  const retainedSourceWitnesses =
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
      sourceWitnesses,
    ).filter((sourceWitness) => {
      const freshnessKey = buildPriorityRecoveryWitnessFreshnessKey(
        sourceWitness,
      );
      if (!canonicalFreshnessByKey.has(freshnessKey)) {
        return false;
      }
      const sourceFreshnessAtMs =
        resolvePriorityRecoveryWitnessFreshnessAtMs(sourceWitness);
      const canonicalFreshnessAtMs = canonicalFreshnessByKey.get(freshnessKey);
      return (
        sourceFreshnessAtMs !== null &&
        (
          canonicalFreshnessAtMs === null ||
          sourceFreshnessAtMs > canonicalFreshnessAtMs
        )
      );
    });
  return dedupePriorityRecoveryObservationWitnesses([
    ...canonical,
    ...retainedSourceWitnesses,
  ]);
}

function resolvePriorityRecoveryObservationWitnesses(
  primaryWitnesses,
  fallbackWitnesses,
) {
  const primary = normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
    primaryWitnesses,
  );
  const fallback = normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
    fallbackWitnesses,
  );
  return [
    ...dedupePriorityRecoveryObservationWitnesses([
      ...primary,
      ...fallback,
    ]),
  ];
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
    const retainedWitnesses =
      resolveFreshRetainedPriorityRecoveryObservationWitnesses(
        canonicalObservation.priorityRecoveryPartitionWitnesses,
        sourceObservation.priorityRecoveryPartitionWitnesses,
      );
    return retainedWitnesses.length > ZERO ?
      {
        ...canonicalObservation,
        priorityRecoveryPartitionWitnesses: retainedWitnesses,
      } :
      canonicalObservation;
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
    reasonCounts[dominantReason] = ONE;
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

function resolvePublicationConvergenceRecoveryProtocolState({
  rawRecoveryProtocolState,
  activePrioritySpreadGate,
  publicationRecoveryOpen,
}) {
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

function resolveActiveGateSelectedPublishedMembershipDeficitNodeIds(
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

function resolveActiveGateSelectedMissingPublishedNodeIds(progress = null) {
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

function resolveAuthoritativePublicationMembershipNodeIds({
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

function resolveRelevantPublicationMembershipNodeIds(
  nodeIds = null,
  authoritativePublicationMembershipNodeIds = [],
) {
  if (!Array.isArray(nodeIds)) {
    return null;
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

function hasStalePublicationClosureEvidence({
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

function buildPublicationMissingPublishedEvidence({
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
  const coverageCanonicalNodeIds = rawCoverageCanonicalNodeIds.length > ZERO ?
    rawCoverageCanonicalNodeIds :
    currentActiveGateSelectedMembershipDeficitOpen === true ?
      activeGateSelectedPublicationMembershipDeficitNodeIds :
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
      currentActiveGateSelectedMembershipDeficitOpen === true ?
        true :
      rawCoverageCanonicalEvidenceAvailable !== true ?
        true :
      coverageCanonicalNodeIds.length === ZERO ?
        coverageCanonicalMissingActiveNodeReasonNodeIds.length > ZERO :
        coverageCanonicalNodeIds.some((nodeId) =>
          coverageCanonicalMissingActiveNodeReasonNodeIds.includes(nodeId),
        )
    );
  const canonicalNodeIds = normalizeDistinctStringArray([
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
    ...rule.select(evidence),
  });
}

function resolvePendingRequiredAckNodeIds(pendingAckSource = null) {
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

function hasCurrentActiveGatePendingAckClosure(progress = null) {
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

function buildActiveGatePendingAckEvidence(progress = null) {
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

function shouldSuppressActiveGateSnapshotPublicationDebt({
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

function hasActiveGatePendingAckDebt(progress = null) {
  const pendingAckEvidence = buildActiveGatePendingAckEvidence(progress);
  return (
    pendingAckEvidence.explicitNodeListOpen === true ||
    pendingAckEvidence.requiredAckListOpen === true ||
    pendingAckEvidence.ackStatusCountOpen === true
  );
}

function resolveActiveGatePublicationDebtSuppressionProgress({
  controlPlane = null,
  priorityRecoveryObservation = null,
  activeGateProgress = null,
} = {}) {
  const rawActiveGateProgressSources = [
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

function resolveCurrentPendingAckNodeIds({
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

function buildPublicationConvergenceSummary(controlPlane) {
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
      blockingReasonCounts[reason] =
        (blockingReasonCounts[reason] || ZERO) + ONE;
    }
  }
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate:
      priorityRecoveryObservation?.activeGate ||
      explicitPriorityRecoveryObservation?.activeGate ||
      controlPlane?.activeGate ||
      null,
    activeGateProgress:
      priorityRecoveryObservation?.activeGateProgress ||
      explicitPriorityRecoveryObservation?.activeGateProgress ||
      controlPlane?.activeGateProgress ||
      null,
    activeGateBestProgress:
      priorityRecoveryObservation?.activeGateBestProgress ||
      explicitPriorityRecoveryObservation?.activeGateBestProgress ||
      controlPlane?.activeGateBestProgress ||
      null,
    activeGateNoProgress:
      priorityRecoveryObservation?.activeGateNoProgress ||
      explicitPriorityRecoveryObservation?.activeGateNoProgress ||
      controlPlane?.activeGateNoProgress ||
      null,
    activeGateBlockerHistory:
      priorityRecoveryObservation?.activeGateBlockerHistory ||
      explicitPriorityRecoveryObservation?.activeGateBlockerHistory ||
      controlPlane?.activeGateBlockerHistory ||
      null,
    activeGateAdmissionState:
      priorityRecoveryObservation?.activeGateAdmissionState ||
      explicitPriorityRecoveryObservation?.activeGateAdmissionState ||
      controlPlane?.activeGateAdmissionState ||
      null,
  });
  const activeGateProgress = activeGate?.progress || null;
  const activeGateBestProgress = activeGate?.bestProgress || null;
  const currentPendingAckNodeIds = resolveCurrentPendingAckNodeIds({
    activeGateProgress,
    priorityRecoveryObservation,
    publicationConvergence,
    publicationConvergenceGate,
  });
  const rawPendingAckNodeIds = currentPendingAckNodeIds || [];
  const activeGateSnapshotCoverage =
    controlPlane?.activeGateSnapshotCoverage &&
    typeof controlPlane.activeGateSnapshotCoverage === 'object' ?
      controlPlane.activeGateSnapshotCoverage :
      null;
  const activeGateNoProgress =
    isRecord(priorityRecoveryObservation?.activeGateNoProgress) ?
      priorityRecoveryObservation.activeGateNoProgress :
      isRecord(explicitPriorityRecoveryObservation?.activeGateNoProgress) ?
        explicitPriorityRecoveryObservation.activeGateNoProgress :
        isRecord(controlPlane?.activeGateNoProgress) ?
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
      Array.isArray(
        explicitPriorityRecoveryObservation?.activeGateBlockerHistory,
      ) ?
        explicitPriorityRecoveryObservation.activeGateBlockerHistory :
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
    bestProgressSnapshot: activeGateBestProgress,
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
    currentPendingAckNodeIds !== null ?
      pendingAckNodeIds.length :
      hasCurrentActiveGatePendingAckClosure(activeGateProgress) === true ?
        ZERO :
      Math.max(
        normalizeNonNegativeCount(priorityRecoveryObservation?.pendingAckCount),
        normalizeNonNegativeCount(publicationConvergence?.pendingAckCount),
        normalizeNonNegativeCount(publicationConvergenceGate?.pendingAckCount),
        normalizeNonNegativeCount(activeGateProgress?.pendingAckCount),
        normalizeNonNegativeCount(activeGateBestProgress?.pendingAckCount),
      );
  const missingPublishedEvidence = buildPublicationMissingPublishedEvidence({
    activeGateSnapshotCoveragePending,
    activeGatePriorityRecoveryActuationEvidenceOpen,
    hasExplicitPriorityRecoveryObservation:
      controlPlane?.hasExplicitPriorityRecoveryObservation === true,
    activeGateProgress,
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
    rawPublicationConvergence,
    rawPublicationConvergenceGate,
  });
  const missingPublishedNodeIds = missingPublishedEvidence.nodeIds;
  const missingPublishedCount = missingPublishedEvidence.count;
  const explicitPublicationPendingOpen =
    priorityRecoveryObservation?.publicationPending === true ||
    publicationConvergenceGate?.publicationPending === true ||
    publicationConvergence?.publicationPending === true;
  const coverageLagAllowsExplicitPublicationPending =
    activeGateSnapshotCoveragePending !== true ||
    (
      missingPublishedEvidence.state ===
        PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
          .CANONICAL_DURING_COVERAGE_LAG &&
      missingPublishedCount > ZERO
    );
  const publicationPendingOpen =
    pendingAckCount > ZERO ||
    (
      explicitPublicationPendingOpen === true &&
      coverageLagAllowsExplicitPublicationPending === true
    );
  const publicationRecoveryOpen =
    publicationPendingOpen ||
    pendingAckCount > ZERO ||
    blockedNodeIds.length > ZERO ||
    missingPublishedCount > ZERO;
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
  const rawRecoveryProtocolState =
    priorityRecoveryObservation?.recoveryProtocolState ||
    publicationConvergence?.recoveryProtocolState ||
    activeGateProgress?.recoveryProtocolState ||
    activeGateBestProgress?.recoveryProtocolState ||
    null;
  const recoveryProtocolState =
    resolvePublicationConvergenceRecoveryProtocolState({
      rawRecoveryProtocolState,
      activePrioritySpreadGate: prioritySpreadPendingOpen,
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
  const publicationConvergenceGateReasons = normalizeDistinctStringArray([
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
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
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
      activeGatePriorityRecoveryActuationEvidenceOpen
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
    recoveryProtocolState,
    priorityRecoveryReasonCodes,
    publicationPending: publicationPendingOpen,
    prioritySpreadPending: prioritySpreadPendingOpen,
    publicationConvergenceGateReasons,
    ...(activeGate ? {activeGate} : {}),
    activeGateProgress,
    activeGateBestProgress,
    activeGateNoProgress,
    activeGateSnapshotCoveragePending,
    activeGateSnapshotCoverageBlocker,
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
    .map((reason) => String(reason?.code || EMPTY_STRING).trim())
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
      nodeDiagnostic?.routingDiagnostics?.routingReadinessDimension ||
        EMPTY_STRING,
    ).trim();
    if (decisionDimension.length === ZERO) {
      continue;
    }
    routingDimensionCounts[decisionDimension] =
      (routingDimensionCounts[decisionDimension] || ZERO) + ONE;
    if (decisionDimension === READINESS_DIMENSION_REPAIR_ELIGIBLE) {
      repairRoutedNodeIds.push(nodeId);
    } else if (
      decisionDimension ===
        READINESS_DIMENSION_CONTROL_PLANE_RECOVERY_ELIGIBLE
    ) {
      recoveryRoutedNodeIds.push(nodeId);
    }
  }

  const recoveryOnlyNodeIds = [];
  const writeUnhealthyNodeIds = [];
  const publicationBlockedNodeIds = [];
  const readinessByNodeId =
    controlPlane?.readinessByNodeId &&
    typeof controlPlane.readinessByNodeId === JS_OBJECT_TYPE ?
      controlPlane.readinessByNodeId :
      {};

  for (const [nodeId, readiness] of Object.entries(readinessByNodeId)) {
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === JS_OBJECT_TYPE ?
        readiness.dimensions :
        {};
    const repairEligible = dimensions.repairEligible === true;
    const recoveryEligible = dimensions.controlPlaneRecoveryEligible === true;
    if (recoveryEligible && !repairEligible) {
      recoveryOnlyNodeIds.push(nodeId);
    }

    const reasonCodes = collectReadinessReasonCodes(readiness);
    if (reasonCodes.includes(READINESS_REASON_CONTROL_PLANE_WRITE_UNHEALTHY)) {
      writeUnhealthyNodeIds.push(nodeId);
    }
    if (
      reasonCodes.includes(
        READINESS_REASON_CONTROL_PLANE_PUBLICATION_PENDING,
      ) ||
      reasonCodes.includes(READINESS_REASON_PUBLISHED_CONVERGENCE_PENDING) ||
      reasonCodes.includes(READINESS_REASON_RECOVERY_ELIGIBILITY_PENDING)
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
    if (!readiness || typeof readiness !== JS_OBJECT_TYPE) {
      pendingAckBlockedNodeIds.push(nodeId);
      continue;
    }
    const dimensions =
      readiness.dimensions && typeof readiness.dimensions === JS_OBJECT_TYPE ?
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
      hasBlockingReadinessFailure(readinessFailure) && publicationStillOpen,
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
  if (
    hasStartupReadinessBlocker &&
    (
      hasMissingActiveNodeBlocker !== true ||
      hasBlockingClosureRecord === true
    )
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_STARTUP_READINESS);
  }
  if (hasBlockingClosureRecord) {
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
      missingPublishedCount: normalizeNonNegativeCount(
        publicationConvergence?.missingPublishedCount,
      ),
      missingPublishedNodeIds: normalizeDistinctStringArray(
        publicationConvergence?.missingPublishedNodeIds,
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
  const hasBlockingClosureRecord =
    hasBlockingPublicationClosureRecord({
      publicationConvergence,
      readinessFailure,
    });
  const pendingAckBlockedNodeCount = recoveryReadinessBlocksFailover ?
    rawPendingAckBlockedNodeCount :
    ZERO;
  const publicationBlockedNodeCount = recoveryReadinessBlocksFailover ?
    rawPublicationBlockedNodeCount :
    ZERO;
  const writeUnhealthyNodeCount = recoveryReadinessBlocksFailover ?
    rawWriteUnhealthyNodeCount :
    ZERO;
  const hasMissingActiveNodeBlocker =
    hasPublicationMissingActiveNodeBlocker(publicationConvergence);
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
  if (
    hasStartupReadinessBlocker &&
    (
      hasMissingActiveNodeBlocker !== true ||
      hasBlockingClosureRecord === true
    )
  ) {
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
      missingPublishedCount: normalizeNonNegativeCount(
        publicationConvergence?.missingPublishedCount,
      ),
      missingPublishedNodeIds: normalizeDistinctStringArray(
        publicationConvergence?.missingPublishedNodeIds,
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
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACK_NODES,
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
  hasPublicationMissingActiveNodeBlocker,
  hasBlockingPublicationClosureRecord,
  isStartupReadinessBlocked,
  countRestartBoundaries,
  buildConvergenceStabilityGate,
  buildFailoverStabilityGate,
};
