import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  OWNER_CONTRACT_STATE,
} from '../../../src/control-plane/owner-contract-outcome.js';
import {buildPriorityRecoveryDecisionSnapshots as buildSharedPriorityRecoveryDecisionSnapshots} from '../../../src/control-plane/priority-recovery-snapshot.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  derivePriorityRecoveryActiveGateReportFields,
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';
import {FAILURE_BUNDLE_SEGMENT_2} from './failure-bundle-segment-2.js';
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
  PLAYBACK_SNAPSHOTS_FILENAME,
  PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
  PLAYBACK_EVENT_TYPE_LOAD_STARTED,
  PLAYBACK_EVENT_TYPE_LOAD_PROGRESS,
  PLAYBACK_EVENT_TYPE_LOAD_COMPLETED,
  PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY,
  PLAYBACK_EVENT_TYPE_PARTITION_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_REMOVED,
  PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  PLAYBACK_STAGE_LOAD_READINESS_WAITING,
  PLAYBACK_STAGE_LOAD_READINESS_STABLE,
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
} = FAILURE_BUNDLE_SEGMENT_2;

const PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD = Object.freeze({
  REPLICA_OPERATIONS: 'replicaOperations',
  ROWS: 'rows',
  SERVICES: 'services',
  TIMESTAMP: 'timestamp',
});
const PLAYBACK_STAGE_SETUP_CLUSTER_ACTIVE = 'setup.cluster.active';
const PLAYBACK_CONTROL_PLANE_FALLBACK_STAGE_IDS = Object.freeze(new Set([
  PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  PLAYBACK_STAGE_SETUP_CLUSTER_ACTIVE,
  PLAYBACK_STAGE_LOAD_READINESS_WAITING,
  PLAYBACK_STAGE_LOAD_READINESS_STABLE,
]));
const DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD = Object.freeze({
  ACTIVE_GATE: 'activeGate',
  ACTIVE_GATE_PROGRESS: 'activeGateProgress',
  ACTIVE_GATE_ADMISSION_STATE: 'activeGateAdmissionState',
  ACTIVE_GATE_SNAPSHOT_COVERAGE: 'activeGateSnapshotCoverage',
  PRIORITY_RECOVERY_INVARIANTS: 'priorityRecoveryInvariants',
});
const DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD = Object.freeze({
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  PUBLICATION_CONVERGENCE_GATE: 'publicationConvergenceGate',
  PRIORITY_RECOVERY_OBSERVATION: 'priorityRecoveryObservation',
  PRIORITY_RECOVERY_DECISION_SNAPSHOTS: 'priorityRecoveryDecisionSnapshots',
  PRIORITY_RECOVERY_INVARIANTS: 'priorityRecoveryInvariants',
  STARTUP_RECOVERY: 'startupRecovery',
});
const ACTIVE_GATE_PUBLICATION_GATE_READY_BLOCKER = 'ready';
const PRIORITY_RECOVERY_LOG_OPERATION_STATUS_RETRY_DEFERRED =
  'retry_deferred';
const PRIORITY_RECOVERY_LOG_EVIDENCE_SOURCE_OPERATION_DISPATCH =
  'operation_dispatch_retry_log';
const DECISION_ARTIFACT_OPERATION_DISPATCH_RETRY_DEFERRALS_FIELD =
  'operationDispatchRetryDeferrals';
const DECISION_ARTIFACT_OPERATION_ID_FIELD = 'operationId';
const DECISION_ARTIFACT_PARTITION_ID_FIELD = 'partitionId';
const DECISION_ARTIFACT_WORKFLOW_STEP_FIELD = 'workflowStep';
const DECISION_ARTIFACT_DELAY_MS_FIELD = 'delayMs';
const DECISION_ARTIFACT_BOUNDARY_FIELD = 'boundary';
const PRIORITY_RECOVERY_LOG_DISPATCH_RETRY_BOUNDARY = Object.freeze({
  COORDINATOR_CREATED_REMOTE_HANDOFF: 'coordinator_created_remote_handoff',
  PRIORITY_ACTIVE_REPLACE_RESUME: 'priority_active_replace_resume',
});
const PRIORITY_RECOVERY_LOG_DISPATCH_RETRY_BOUNDARY_WITNESS_BY_BOUNDARY =
  Object.freeze({
    [PRIORITY_RECOVERY_LOG_DISPATCH_RETRY_BOUNDARY
      .COORDINATOR_CREATED_REMOTE_HANDOFF]: Object.freeze({
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    [PRIORITY_RECOVERY_LOG_DISPATCH_RETRY_BOUNDARY
      .PRIORITY_ACTIVE_REPLACE_RESUME]: Object.freeze({
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
    }),
  });
const EMPTY_STRING = '';
const NEWLINE = '\n';
const ONE = 1;
const FAILURE_BUNDLE_SEGMENT_TYPE = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
});
const WORKFLOW_DENIED_TRANSITION_STATE = Object.freeze({
  BLOCKED: 'blocked',
  DEFERRED: 'deferred',
});

function buildPlaybackControlPlaneFallback(events) {
  const sortedEvents = [...(Array.isArray(events) ? events : [])]
    .filter((event) => isRecord(event))
    .sort(
      (left, right) =>
        Number(left.timestamp || ZERO) - Number(right.timestamp || ZERO),
    );
  let selectedActiveGateDetails = null;
  let selectedActiveGateTimestampMs = null;
  let selectedActiveGateScore = Number.NEGATIVE_INFINITY;

  for (const event of sortedEvents) {
    if (event.type !== PLAYBACK_EVENT_TYPE_CLUSTER_STAGE) {
      continue;
    }
    const details =
      event?.details && typeof event.details === 'object' ?
        event.details :
        null;
    if (
      !details ||
      !PLAYBACK_CONTROL_PLANE_FALLBACK_STAGE_IDS.has(details.stage)
    ) {
      continue;
    }
    const hasSnapshotCoverage =
      details.snapshotCoverage && typeof details.snapshotCoverage === 'object';
    const hasPublicationGate =
      details.publicationConvergenceGate &&
      typeof details.publicationConvergenceGate === 'object';
    if (!hasSnapshotCoverage && !hasPublicationGate) {
      continue;
    }
    const candidateTimestampMs = normalizeNonNegativeCount(event.timestamp);
    const candidateScore = scorePlaybackActiveGateDetails(details);
    const shouldSelectCandidate =
      !selectedActiveGateDetails ||
      candidateScore > selectedActiveGateScore ||
      (candidateScore === selectedActiveGateScore &&
        candidateTimestampMs >
          normalizeNonNegativeCount(selectedActiveGateTimestampMs));
    if (!shouldSelectCandidate) {
      continue;
    }
    selectedActiveGateDetails = details;
    selectedActiveGateTimestampMs = candidateTimestampMs;
    selectedActiveGateScore = candidateScore;
  }

  if (!selectedActiveGateDetails) {
    return null;
  }

  const publicationConvergence = resolvePlaybackPublicationConvergence(
    selectedActiveGateDetails,
  );
  const publishedMembershipObservation =
    resolvePlaybackPublishedMembershipObservation(selectedActiveGateDetails);
  const publicationConvergenceGate =
    selectedActiveGateDetails.publicationConvergenceGate &&
    typeof selectedActiveGateDetails.publicationConvergenceGate === 'object' ?
      cloneJsonValue(selectedActiveGateDetails.publicationConvergenceGate) :
      null;
  const snapshotCoverage =
    selectedActiveGateDetails.snapshotCoverage &&
    typeof selectedActiveGateDetails.snapshotCoverage === 'object' ?
      cloneJsonValue(selectedActiveGateDetails.snapshotCoverage) :
      null;
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot(
    selectedActiveGateDetails,
  );
  const activeGateReportFields = derivePriorityRecoveryActiveGateReportFields(
    activeGate,
  );
  const priorityRecoveryDecisionSnapshots =
    selectedActiveGateDetails?.snapshotCoverage &&
    typeof selectedActiveGateDetails.snapshotCoverage === 'object' &&
    isRecord(
      selectedActiveGateDetails.snapshotCoverage
        .selectedPriorityRecoveryDecisionSnapshots,
    ) ?
      cloneJsonValue(
        selectedActiveGateDetails.snapshotCoverage
          .selectedPriorityRecoveryDecisionSnapshots,
      ) :
      null;
  const priorityRecoveryInvariants =
    selectedActiveGateDetails.priorityRecoveryInvariants &&
    typeof selectedActiveGateDetails.priorityRecoveryInvariants === 'object' ?
      cloneJsonValue(selectedActiveGateDetails.priorityRecoveryInvariants) :
      null;

  const readinessByNodeId = {};
  const nodeDiagnostics = Array.isArray(
    selectedActiveGateDetails.nodeDiagnostics,
  ) ?
    selectedActiveGateDetails.nodeDiagnostics :
    [];
  for (const nodeDiagnostic of nodeDiagnostics) {
    const nodeId = String(nodeDiagnostic?.nodeId || '').trim();
    if (nodeId.length === ZERO) {
      continue;
    }
    const reasonCodes = Array.isArray(nodeDiagnostic?.reasons) ?
      nodeDiagnostic.reasons
        .map((reason) => String(reason || '').trim())
        .filter((reason) => reason.length > ZERO) :
      [];
    readinessByNodeId[nodeId] = {
      nodeId,
      reasons: reasonCodes.map((code) => ({code})),
    };
  }

  const controlPlaneFallback = {
    publicationConvergence,
    publicationConvergenceGate,
    publishedMembershipObservation,
    activeGateSnapshotCoverage: snapshotCoverage,
    ...(activeGate ? {activeGate} : {}),
    ...activeGateReportFields,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryInvariants,
    readinessByNodeId:
      Object.keys(readinessByNodeId).length > ZERO ? readinessByNodeId : null,
    activeGateObservedAtMs: selectedActiveGateTimestampMs,
    activeGateObservedAt: toIsoTimestamp(selectedActiveGateTimestampMs),
  };

  const selectedSnapshotNodeId = String(
    snapshotCoverage?.selectedNodeId || '',
  ).trim();
  const selectedCapturedAtMs = normalizeNonNegativeCount(
    snapshotCoverage?.selectedCapturedAtMs,
  );
  const observedNodeIds = Array.isArray(
    snapshotCoverage?.selectedObservedNodeIds,
  ) ?
    snapshotCoverage.selectedObservedNodeIds
      .map((nodeId) => String(nodeId || '').trim())
      .filter((nodeId) => nodeId.length > ZERO) :
    [];
  const controlSnapshotByNodeId =
    selectedSnapshotNodeId.length > ZERO ?
      {
        [selectedSnapshotNodeId]: {
          nodeId: selectedSnapshotNodeId,
          capturedAtMs: selectedCapturedAtMs,
          capturedAt: toIsoTimestamp(selectedCapturedAtMs),
          observedNodeIds,
          source: 'playback_active_gate',
          controlPlaneDiagnostics: {
            publicationConvergence,
            publishedMembershipObservation,
            priorityRecoveryDecisionSnapshots,
            priorityRecoveryInvariants,
          },
        },
      } :
      null;

  return {
    controlPlaneFallback,
    controlSnapshotByNodeId,
  };
}

function resolveDecisionArtifactProgressAtMs(artifact = null) {
  const timestampMs = Date.parse(artifact?.timestamp);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function resolvePriorityRecoveryLogDispatchRetryBoundaryWitness(artifact = null) {
  const boundary = String(
    artifact?.[DECISION_ARTIFACT_BOUNDARY_FIELD] || EMPTY_STRING,
  ).trim();
  return boundary.length > ZERO ?
    PRIORITY_RECOVERY_LOG_DISPATCH_RETRY_BOUNDARY_WITNESS_BY_BOUNDARY[
      boundary
    ] || null :
    null;
}

function buildPriorityRecoveryLogWitnessFromDispatchRetryDeferral(artifact) {
  if (!isRecord(artifact)) {
    return null;
  }
  const boundaryWitness =
    resolvePriorityRecoveryLogDispatchRetryBoundaryWitness(artifact);
  if (!boundaryWitness) {
    return null;
  }
  const partitionId = String(
    artifact[DECISION_ARTIFACT_PARTITION_ID_FIELD] || EMPTY_STRING,
  ).trim();
  const operationId = String(
    artifact[DECISION_ARTIFACT_OPERATION_ID_FIELD] || EMPTY_STRING,
  ).trim();
  if (partitionId.length === ZERO || operationId.length === ZERO) {
    return null;
  }
  const workflowStep = String(
    artifact[DECISION_ARTIFACT_WORKFLOW_STEP_FIELD] || EMPTY_STRING,
  ).trim();
  const retryAfterMs = normalizeNonNegativeCount(
    artifact[DECISION_ARTIFACT_DELAY_MS_FIELD],
  );
  const lastProgressAtMs = resolveDecisionArtifactProgressAtMs(artifact);
  return {
    partitionId,
    semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    progressContractState: OWNER_CONTRACT_STATE.PENDING,
    actuationState:
      PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
    currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    actuationOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    blockingBoundary: boundaryWitness.blockingBoundary,
    waitMode: boundaryWitness.waitMode,
    nextRequiredAction: boundaryWitness.nextRequiredAction,
    workflowProgressPhaseId: boundaryWitness.workflowProgressPhaseId,
    operationIds: [operationId],
    witnessIds: [operationId],
    correlationKey: buildPriorityRecoveryCorrelationKey({
      partitionId,
      operationId,
    }),
    progressEvidenceSourceIds: [
      PRIORITY_RECOVERY_LOG_EVIDENCE_SOURCE_OPERATION_DISPATCH,
    ],
    ...(retryAfterMs !== null ? {retryAfterMs} : {}),
    ...(lastProgressAtMs !== null ? {lastProgressAtMs} : {}),
    ...(workflowStep.length > ZERO ?
      {latestOperationWorkflowStep: workflowStep} :
      {}),
    latestOperationStatus:
      PRIORITY_RECOVERY_LOG_OPERATION_STATUS_RETRY_DEFERRED,
  };
}

function buildPriorityRecoveryObservationFromDecisionArtifactsByNodeId(
  decisionArtifactsByNodeId,
) {
  if (!isRecord(decisionArtifactsByNodeId)) {
    return null;
  }
  const priorityRecoveryPartitionWitnesses = [];
  for (const decisionArtifacts of Object.values(decisionArtifactsByNodeId)) {
    const retryDeferrals = Array.isArray(
      decisionArtifacts?.[
        DECISION_ARTIFACT_OPERATION_DISPATCH_RETRY_DEFERRALS_FIELD
      ],
    ) ?
      decisionArtifacts[
        DECISION_ARTIFACT_OPERATION_DISPATCH_RETRY_DEFERRALS_FIELD
      ] :
      [];
    for (const retryDeferral of retryDeferrals) {
      const witness =
        buildPriorityRecoveryLogWitnessFromDispatchRetryDeferral(
          retryDeferral,
        );
      if (witness) {
        priorityRecoveryPartitionWitnesses.push(witness);
      }
    }
  }
  return priorityRecoveryPartitionWitnesses.length > ZERO ?
    {priorityRecoveryPartitionWitnesses} :
    null;
}

function mergePriorityRecoveryObservationWitnessLists(
  primaryWitnesses,
  fallbackWitnesses,
) {
  return [
    ...(Array.isArray(primaryWitnesses) ? primaryWitnesses : []),
    ...(Array.isArray(fallbackWitnesses) ? fallbackWitnesses : []),
  ];
}

function mergePlaybackPriorityRecoveryObservation(
  controlPlane,
  priorityRecoveryObservation,
) {
  if (!isRecord(priorityRecoveryObservation)) {
    return controlPlane;
  }
  const mergedControlPlane = isRecord(controlPlane) ? controlPlane : {};
  const existingObservation = isRecord(
    mergedControlPlane.priorityRecoveryObservation,
  ) ?
    mergedControlPlane.priorityRecoveryObservation :
    {};
  return {
    ...mergedControlPlane,
    priorityRecoveryObservation: {
      ...priorityRecoveryObservation,
      ...existingObservation,
      priorityRecoveryPartitionWitnesses:
        mergePriorityRecoveryObservationWitnessLists(
          existingObservation.priorityRecoveryPartitionWitnesses,
          priorityRecoveryObservation.priorityRecoveryPartitionWitnesses,
        ),
    },
  };
}

function buildRestartBoundariesFromPlaybackEvents(events) {
  const restartBoundariesByNodeId = {};
  for (const event of Array.isArray(events) ? events : []) {
    if (
      !isRecord(event) ||
      event.type !== PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY
    ) {
      continue;
    }
    const nodeId = String(
      event?.entityId || event?.details?.snapshot?.nodeId || '',
    ).trim();
    if (nodeId.length === ZERO) {
      continue;
    }
    if (!Array.isArray(restartBoundariesByNodeId[nodeId])) {
      restartBoundariesByNodeId[nodeId] = [];
    }
    restartBoundariesByNodeId[nodeId].push({
      timestampMs: normalizeNonNegativeCount(event?.timestamp),
      timestamp: toIsoTimestamp(normalizeNonNegativeCount(event?.timestamp)),
      phase:
        typeof event?.details?.phase === FAILURE_BUNDLE_SEGMENT_TYPE.STRING ?
          event.details.phase :
          UNKNOWN_VALUE,
      snapshot: isRecord(event?.details?.snapshot) ?
        event.details.snapshot :
        null,
      error:
        typeof event?.details?.error === FAILURE_BUNDLE_SEGMENT_TYPE.STRING ?
          event.details.error :
          null,
    });
  }
  return Object.keys(restartBoundariesByNodeId).length > ZERO ?
    restartBoundariesByNodeId :
    null;
}

async function collectPlaybackEventInsights(scenarioDir, workspaceRoot) {
  const playbackEventsAbsolutePath = join(
    scenarioDir,
    PLAYBACK_EVENTS_FILENAME,
  );
  try {
    const content = await readFile(playbackEventsAbsolutePath, UTF8_ENCODING);
    const events = String(content || EMPTY_STRING)
      .split(NEWLINE)
      .map((line) => String(line || EMPTY_STRING).trim())
      .filter((line) => line.length > ZERO)
      .map((line) => {
        try {
          const parsed = JSON.parse(line);
          return isRecord(parsed) ? parsed : null;
        } catch (_error) {
          return null;
        }
      })
      .filter((event) => event !== null);
    if (events.length === ZERO) {
      return null;
    }
    const controlPlaneFallback = buildPlaybackControlPlaneFallback(events);
    return {
      playbackEventsPath: toWorkspaceRelative(
        playbackEventsAbsolutePath,
        workspaceRoot,
      ),
      playbackEventSummary: buildPlaybackEventSummary(events),
      firstFaultTimeline: buildFirstFaultTimelineFromPlaybackEvents(events),
      readiness: buildReadinessFromPlaybackEvents(events),
      restartBoundariesByNodeId:
        buildRestartBoundariesFromPlaybackEvents(events),
      controlPlaneFallback: controlPlaneFallback?.controlPlaneFallback || null,
      controlSnapshotByNodeId:
        controlPlaneFallback?.controlSnapshotByNodeId || null,
    };
  } catch (_error) {
    return null;
  }
}

function parsePlaybackSnapshotStates(rawContent) {
  return String(rawContent || EMPTY_STRING)
    .split(NEWLINE)
    .map((line) => String(line || EMPTY_STRING).trim())
    .filter((line) => line.length > ZERO)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return isRecord(parsed) ? parsed : null;
      } catch (_error) {
        return null;
      }
    })
    .filter((snapshot) => snapshot !== null);
}

function selectLatestPlaybackSnapshot(snapshotStates = []) {
  const snapshots = Array.isArray(snapshotStates) ? snapshotStates : [];
  if (snapshots.length === ZERO) {
    return null;
  }
  return snapshots.slice().sort((left, right) => {
    return (
      normalizeNonNegativeCount(
        right?.[PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD.TIMESTAMP],
      ) -
      normalizeNonNegativeCount(
        left?.[PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD.TIMESTAMP],
      )
    );
  })[ZERO] || null;
}

function buildPlaybackPriorityRecoveryDecisionSnapshots(entry, latestSnapshot) {
  if (!isRecord(latestSnapshot)) {
    return null;
  }
  const controlPlaneDiagnostics = resolveControlPlaneDiagnostics(entry);
  const publicationConvergence = isRecord(
    controlPlaneDiagnostics?.publicationConvergence,
  ) ?
    controlPlaneDiagnostics.publicationConvergence :
    null;
  if (!isRecord(publicationConvergence)) {
    return null;
  }
  const replicaOperationRows = Array.isArray(
    latestSnapshot?.[PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD.REPLICA_OPERATIONS],
  ) ?
    latestSnapshot[PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD.REPLICA_OPERATIONS] :
    [];
  const serviceRows = Array.isArray(
    latestSnapshot?.[PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD.SERVICES],
  ) ?
    latestSnapshot[PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD.SERVICES] :
    [];
  if (replicaOperationRows.length === ZERO && serviceRows.length === ZERO) {
    return null;
  }
  return buildSharedPriorityRecoveryDecisionSnapshots({
    capturedAt: normalizeNonNegativeCount(
      latestSnapshot?.[PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD.TIMESTAMP],
    ),
    publicationConvergence,
    readinessByNodeId:
      isRecord(controlPlaneDiagnostics?.readinessByNodeId) ?
        controlPlaneDiagnostics.readinessByNodeId :
        {},
    workflowAdmissionsByWorkflowId:
      isRecord(controlPlaneDiagnostics?.workflowAdmissionsByWorkflowId) ?
        controlPlaneDiagnostics.workflowAdmissionsByWorkflowId :
        {},
    replicaOperationRows,
    replicaOperations: {
      [PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD.ROWS]: replicaOperationRows,
    },
    serviceRows,
    logsTable: isRecord(controlPlaneDiagnostics?.logsTable) ?
      controlPlaneDiagnostics.logsTable :
      null,
  });
}

async function collectPlaybackSnapshotInsights(scenarioDir, entry) {
  const playbackSnapshotsAbsolutePath = join(
    scenarioDir,
    PLAYBACK_SNAPSHOTS_FILENAME,
  );
  try {
    const content = await readFile(playbackSnapshotsAbsolutePath, UTF8_ENCODING);
    const latestSnapshot = selectLatestPlaybackSnapshot(
      parsePlaybackSnapshotStates(content),
    );
    const priorityRecoveryDecisionSnapshots =
      buildPlaybackPriorityRecoveryDecisionSnapshots(entry, latestSnapshot);
    if (!priorityRecoveryDecisionSnapshots) {
      return null;
    }
    return {
      controlPlaneFallback: {
        priorityRecoveryDecisionSnapshots,
      },
    };
  } catch (_error) {
    return null;
  }
}

function resolveReadinessSnapshot(entry, playbackReadiness = null) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const failedArtifacts = diagnostics?.failedPhase?.artifacts || {};
  const readinessTimeline = Array.isArray(failedArtifacts.readinessTimeline) ?
    failedArtifacts.readinessTimeline :
    Array.isArray(failedArtifacts?.gateResult?.readinessTimeline) ?
      failedArtifacts.gateResult.readinessTimeline :
      [];
  const artifactNodeReasonsByNodeId = isRecord(
    failedArtifacts.nodeReasonsByNodeId,
  ) ?
    failedArtifacts.nodeReasonsByNodeId :
    null;
  const failureNodeReasonsByNodeId = isRecord(
    diagnostics?.failure?.nodeReasonsByNodeId,
  ) ?
    diagnostics.failure.nodeReasonsByNodeId :
    null;
  const playbackNodeReasonsByNodeId = isRecord(
    playbackReadiness?.nodeReasonsByNodeId,
  ) ?
    playbackReadiness.nodeReasonsByNodeId :
    null;
  const nodeReasonsByNodeId =
    failureNodeReasonsByNodeId ||
    artifactNodeReasonsByNodeId ||
    playbackNodeReasonsByNodeId ||
    null;
  return {
    nodeReasonsByNodeId,
    strictDiscoveryGate: failedArtifacts.strictDiscoveryGate || null,
    sutLoadDiscovery: failedArtifacts.sutLoadDiscovery || null,
    lastReadinessTimelineEntry:
      readinessTimeline.length > ZERO ?
        readinessTimeline[readinessTimeline.length - ONE] :
        playbackReadiness?.lastReadinessTimelineEntry || null,
  };
}

function resolveDirectActiveGateDiagnostics(diagnostics) {
  if (!isRecord(diagnostics)) {
    return null;
  }
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate: isRecord(
      diagnostics[DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE],
    ) ?
      diagnostics[DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE] :
      null,
    activeGateProgress: isRecord(
      diagnostics[DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_PROGRESS],
    ) ?
      diagnostics[DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_PROGRESS] :
      null,
    activeGateAdmissionState: isRecord(
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_ADMISSION_STATE
      ],
    ) ?
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_ADMISSION_STATE
      ] :
      null,
  });
  const directActiveGateDiagnostics = {
    ...(activeGate ? {activeGate} : {}),
  };
  if (
    isRecord(
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_SNAPSHOT_COVERAGE
      ],
    )
  ) {
    directActiveGateDiagnostics.activeGateSnapshotCoverage =
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_SNAPSHOT_COVERAGE
      ];
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_INVARIANTS
      ],
    )
  ) {
    directActiveGateDiagnostics.priorityRecoveryInvariants =
      normalizePriorityRecoveryInvariants(
        diagnostics[
          DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_INVARIANTS
        ],
      );
  }
  return Object.values(directActiveGateDiagnostics).some((value) => {
    if (Array.isArray(value)) {
      return value.length > ZERO;
    }
    return value !== null && value !== undefined;
  }) ?
    directActiveGateDiagnostics :
    null;
}

function resolveDirectControlPlaneDiagnostics(diagnostics) {
  if (!isRecord(diagnostics)) {
    return null;
  }
  const directDiagnostics = {};
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PUBLICATION_CONVERGENCE
      ],
    )
  ) {
    directDiagnostics.publicationConvergence =
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PUBLICATION_CONVERGENCE
      ];
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PUBLICATION_CONVERGENCE_GATE
      ],
    )
  ) {
    directDiagnostics.publicationConvergenceGate =
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PUBLICATION_CONVERGENCE_GATE
      ];
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_OBSERVATION
      ],
    )
  ) {
    directDiagnostics.priorityRecoveryObservation =
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_OBSERVATION
      ];
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD
          .PRIORITY_RECOVERY_DECISION_SNAPSHOTS
      ],
    )
  ) {
    directDiagnostics.priorityRecoveryDecisionSnapshots =
      normalizePriorityRecoveryDecisionSnapshots(
        diagnostics[
          DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD
            .PRIORITY_RECOVERY_DECISION_SNAPSHOTS
        ],
      );
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_INVARIANTS
      ],
    )
  ) {
    directDiagnostics.priorityRecoveryInvariants =
      normalizePriorityRecoveryInvariants(
        diagnostics[
          DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_INVARIANTS
        ],
      );
  }
  if (
    isRecord(
      diagnostics[DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.STARTUP_RECOVERY],
    )
  ) {
    directDiagnostics.startupRecovery =
      diagnostics[DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.STARTUP_RECOVERY];
  }
  return Object.keys(directDiagnostics).length > ZERO ?
    directDiagnostics :
    null;
}

function buildDirectActiveGatePublicationGate(activeGate) {
  const progress = isRecord(activeGate?.progress) ?
    activeGate.progress :
    null;
  if (!progress) {
    return null;
  }
  const publicationStatus = String(progress.publicationStatus || '').trim();
  const recoveryProtocolState = String(
    progress.recoveryProtocolState || '',
  ).trim();
  if (
    publicationStatus.length === ZERO &&
    recoveryProtocolState.length === ZERO
  ) {
    return null;
  }
  const reasonCodes = normalizeDistinctStringArray(progress.gateReasons);
  const pendingAckCount =
    normalizeNonNegativeCount(progress.pendingAckCount) || ZERO;
  const missingPublishedCount =
    normalizeNonNegativeCount(progress.missingPublishedCount) || ZERO;
  const priorityBlockedPartitionCount =
    normalizeNonNegativeCount(progress.priorityBlockedPartitionCount) ||
    normalizeNonNegativeCount(progress.priorityRecoveryBlockedPartitionCount) ||
    ZERO;
  const prioritySpreadGap =
    normalizeNonNegativeCount(progress.prioritySpreadGap) || ZERO;
  const prioritySpreadPending =
    progress.prioritySpreadSatisfied === false ||
    priorityBlockedPartitionCount > ZERO ||
    prioritySpreadGap > ZERO;
  const ready =
    activeGate.ready === true ||
    (
      progress.blockerSignature === ACTIVE_GATE_PUBLICATION_GATE_READY_BLOCKER &&
      pendingAckCount === ZERO &&
      missingPublishedCount === ZERO &&
      reasonCodes.length === ZERO &&
      prioritySpreadPending === false
    );
  return {
    publicationEpoch:
      normalizeNonNegativeCount(progress.publicationEpoch) || null,
    publicationStatus:
      publicationStatus.length > ZERO ? publicationStatus : null,
    recoveryProtocolState:
      recoveryProtocolState.length > ZERO ? recoveryProtocolState : null,
    reasonCodes,
    pendingAckNodeIds: [],
    pendingAckCount,
    missingPublishedNodeIds: [],
    missingPublishedCount,
    publicationPending: pendingAckCount > ZERO,
    prioritySpreadPending,
    ready,
    priorityPartitionSummary: {
      satisfied: prioritySpreadPending === false,
      blockedPartitionCount: priorityBlockedPartitionCount,
      blockedPartitions: [],
      largestSpreadGap: prioritySpreadGap,
      totalSpreadGap: prioritySpreadGap,
    },
  };
}

function buildDirectActiveGatePublicationConvergence(
  activeGate,
  publicationGate,
) {
  if (!isRecord(publicationGate)) {
    return null;
  }
  const progress = isRecord(activeGate?.progress) ?
    activeGate.progress :
    null;
  return {
    publicationEpoch: publicationGate.publicationEpoch,
    status: publicationGate.publicationStatus,
    publicationStatus: publicationGate.publicationStatus,
    recoveryProtocolState: publicationGate.recoveryProtocolState,
    priorityRecoveryReasonCodes: publicationGate.reasonCodes,
    priorityPartitionSummary: publicationGate.priorityPartitionSummary,
    publishedActiveNodeIds: normalizeDistinctStringArray(
      progress?.selectedPublishedActiveNodeIds,
    ),
    pendingAckNodeIds: publicationGate.pendingAckNodeIds,
    pendingAckCount: publicationGate.pendingAckCount,
    missingPublishedNodeIds: publicationGate.missingPublishedNodeIds,
    missingPublishedCount: publicationGate.missingPublishedCount,
    publicationPending: publicationGate.publicationPending,
    prioritySpreadPending: publicationGate.prioritySpreadPending,
    publicationRecoveryGate: publicationGate,
  };
}

function resolveControlPlaneDiagnostics(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const directActiveGateDiagnostics =
    resolveDirectActiveGateDiagnostics(diagnostics);
  const directActiveGatePublicationGate = buildDirectActiveGatePublicationGate(
    directActiveGateDiagnostics?.activeGate,
  );
  const directActiveGatePublicationConvergence =
    buildDirectActiveGatePublicationConvergence(
      directActiveGateDiagnostics?.activeGate,
      directActiveGatePublicationGate,
    );
  const directLedgerSnapshotsByNodeId =
    diagnostics?.rootCauseBundle?.controlPlaneLedgerSnapshotsByNodeId &&
    typeof diagnostics.rootCauseBundle.controlPlaneLedgerSnapshotsByNodeId ===
      'object' ?
      diagnostics.rootCauseBundle.controlPlaneLedgerSnapshotsByNodeId :
      null;
  const snapshotsByNodeId = resolveControlSnapshot(entry);
  const directDiagnosticsFromEntry = isRecord(
    entry?.details?.diagnostics?.controlPlaneDiagnostics,
  ) ?
    entry.details.diagnostics.controlPlaneDiagnostics :
    null;
  const directDiagnosticsFromRootCause = isRecord(
    diagnostics?.rootCauseBundle?.controlPlaneDiagnostics,
  ) ?
    diagnostics.rootCauseBundle.controlPlaneDiagnostics :
    null;
  const directDiagnosticsFromTopLevel =
    resolveDirectControlPlaneDiagnostics(diagnostics);
  const directDiagnostics =
    directDiagnosticsFromEntry ||
    directDiagnosticsFromRootCause ||
    (isRecord(diagnostics?.controlPlaneDiagnostics) ?
      diagnostics.controlPlaneDiagnostics :
      null) ||
    directDiagnosticsFromTopLevel;
  const directDiagnosticSnapshotNodeIdCandidate = String(
    diagnostics?.snapshotNodeId || directDiagnostics?.snapshotNodeId || '',
  ).trim();
  const directDiagnosticSnapshotNodeId =
    directDiagnosticSnapshotNodeIdCandidate.length > ZERO ?
      directDiagnosticSnapshotNodeIdCandidate :
      UNKNOWN_VALUE;
  const directDiagnosticSources = directDiagnostics ?
    {
      [directDiagnosticSnapshotNodeId]: {
        controlPlaneDiagnostics: directDiagnostics,
      },
    } :
    null;
  const publicationModeByNodeId = {};
  const heartbeatPublicationByNodeId = {};
  let publicationConvergence =
    directDiagnostics?.publicationConvergence &&
    typeof directDiagnostics.publicationConvergence ===
      FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
      directDiagnostics.publicationConvergence :
      null;
  let priorityRecoveryObservation =
    directDiagnostics?.priorityRecoveryObservation &&
    typeof directDiagnostics.priorityRecoveryObservation ===
      FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
      directDiagnostics.priorityRecoveryObservation :
      null;
  let priorityRecoveryDecisionSnapshots =
    normalizePriorityRecoveryDecisionSnapshots(
      directDiagnostics?.priorityRecoveryDecisionSnapshots,
    );
  let priorityRecoveryInvariants = normalizePriorityRecoveryInvariants(
    directDiagnostics?.priorityRecoveryInvariants,
  );
  const readinessByNodeId = {};
  const nodeLivenessByNodeId = {};
  const readinessTransitionsByNodeId = {};
  const placementEligibilityByNodeId = {};
  const workflowAdmissionsByWorkflowId = {};
  const timeoutClassifications = [];
  const participationDecisions = [];
  const authoritativeReadinessRepairs = [];
  const recoveryEpochsByNodeId = {};
  const controlPlaneOperations = [];
  let startupRecovery =
    directDiagnostics?.startupRecovery &&
    typeof directDiagnostics.startupRecovery ===
      FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
      directDiagnostics.startupRecovery :
      null;

  const diagnosticSources =
    directLedgerSnapshotsByNodeId &&
    Object.keys(directLedgerSnapshotsByNodeId).length > ZERO ?
      directLedgerSnapshotsByNodeId :
      snapshotsByNodeId && Object.keys(snapshotsByNodeId).length > ZERO ?
        snapshotsByNodeId :
        directDiagnosticSources;

  if (
    diagnosticSources &&
    typeof diagnosticSources === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
  ) {
    for (const [snapshotNodeId, snapshot] of Object.entries(
      diagnosticSources,
    )) {
      const controlPlaneDiagnostics =
        snapshot?.controlPlaneDiagnostics &&
        typeof snapshot.controlPlaneDiagnostics ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
          snapshot.controlPlaneDiagnostics :
          null;
      if (!controlPlaneDiagnostics) {
        continue;
      }

      if (
        controlPlaneDiagnostics.publicationMode &&
        typeof controlPlaneDiagnostics.publicationMode ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        publicationModeByNodeId[snapshotNodeId] =
          controlPlaneDiagnostics.publicationMode;
      }
      if (
        !publicationConvergence &&
        controlPlaneDiagnostics.publicationConvergence &&
        typeof controlPlaneDiagnostics.publicationConvergence ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        publicationConvergence = controlPlaneDiagnostics.publicationConvergence;
      }
      if (
        !priorityRecoveryObservation &&
        controlPlaneDiagnostics.priorityRecoveryObservation &&
        typeof controlPlaneDiagnostics.priorityRecoveryObservation ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        priorityRecoveryObservation =
          controlPlaneDiagnostics.priorityRecoveryObservation;
      }
      priorityRecoveryDecisionSnapshots =
        mergePriorityRecoveryDecisionSnapshots(
          priorityRecoveryDecisionSnapshots,
          controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots,
        );
      priorityRecoveryInvariants = mergePriorityRecoveryInvariants(
        priorityRecoveryInvariants,
        controlPlaneDiagnostics.priorityRecoveryInvariants,
      );
      if (
        controlPlaneDiagnostics.heartbeatPublication &&
        typeof controlPlaneDiagnostics.heartbeatPublication ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        heartbeatPublicationByNodeId[snapshotNodeId] =
          controlPlaneDiagnostics.heartbeatPublication;
      }
      if (
        !startupRecovery &&
        controlPlaneDiagnostics.startupRecovery &&
        typeof controlPlaneDiagnostics.startupRecovery ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        startupRecovery = controlPlaneDiagnostics.startupRecovery;
      }

      const readiness =
        controlPlaneDiagnostics.readinessByNodeId &&
        typeof controlPlaneDiagnostics.readinessByNodeId === 'object' ?
          controlPlaneDiagnostics.readinessByNodeId :
          {};
      Object.assign(readinessByNodeId, readiness);

      const nodeLiveness =
        controlPlaneDiagnostics.nodeLivenessByNodeId &&
        typeof controlPlaneDiagnostics.nodeLivenessByNodeId === 'object' ?
          controlPlaneDiagnostics.nodeLivenessByNodeId :
          {};
      Object.assign(nodeLivenessByNodeId, nodeLiveness);

      const readinessTransitions =
        controlPlaneDiagnostics.readinessTransitionsByNodeId &&
        typeof controlPlaneDiagnostics.readinessTransitionsByNodeId === 'object' ?
          controlPlaneDiagnostics.readinessTransitionsByNodeId :
          {};
      for (const [nodeId, transitions] of Object.entries(
        readinessTransitions,
      )) {
        const existing = readinessTransitionsByNodeId[nodeId] || [];
        readinessTransitionsByNodeId[nodeId] = mergeTransitionHistory(
          existing,
          transitions,
        );
      }

      const placement =
        controlPlaneDiagnostics.placementEligibilityByNodeId &&
        typeof controlPlaneDiagnostics.placementEligibilityByNodeId === 'object' ?
          controlPlaneDiagnostics.placementEligibilityByNodeId :
          {};
      Object.assign(placementEligibilityByNodeId, placement);

      const workflows =
        controlPlaneDiagnostics.workflowAdmissionsByWorkflowId &&
        typeof controlPlaneDiagnostics.workflowAdmissionsByWorkflowId ===
          'object' ?
          controlPlaneDiagnostics.workflowAdmissionsByWorkflowId :
          {};
      Object.assign(workflowAdmissionsByWorkflowId, workflows);

      const timeouts = Array.isArray(
        controlPlaneDiagnostics.timeoutClassifications,
      ) ?
        controlPlaneDiagnostics.timeoutClassifications :
        [];
      for (const timeout of timeouts) {
        if (
          !timeout ||
          typeof timeout !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
        ) {
          continue;
        }
        timeoutClassifications.push({
          snapshotNodeId,
          ...timeout,
        });
      }

      const decisions = Array.isArray(
        controlPlaneDiagnostics.participationDecisions,
      ) ?
        controlPlaneDiagnostics.participationDecisions :
        [];
      for (const decision of decisions) {
        if (
          !decision ||
          typeof decision !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
        ) {
          continue;
        }
        participationDecisions.push({
          snapshotNodeId,
          ...decision,
        });
      }

      const repairs = Array.isArray(
        controlPlaneDiagnostics.authoritativeReadinessRepairs,
      ) ?
        controlPlaneDiagnostics.authoritativeReadinessRepairs :
        [];
      for (const repair of repairs) {
        if (
          !repair ||
          typeof repair !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
        ) {
          continue;
        }
        authoritativeReadinessRepairs.push({
          snapshotNodeId,
          ...repair,
        });
      }

      const recoveryEpochs =
        controlPlaneDiagnostics.recoveryEpochsByNodeId &&
        typeof controlPlaneDiagnostics.recoveryEpochsByNodeId ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
          controlPlaneDiagnostics.recoveryEpochsByNodeId :
          {};
      for (const [nodeId, epochs] of Object.entries(recoveryEpochs)) {
        const existing = Array.isArray(recoveryEpochsByNodeId[nodeId]) ?
          recoveryEpochsByNodeId[nodeId] :
          [];
        recoveryEpochsByNodeId[nodeId] = [
          ...existing,
          ...(Array.isArray(epochs) ?
            epochs.map((epoch) => ({
              snapshotNodeId,
              ...epoch,
            })) :
            []),
        ];
      }

      const operations = Array.isArray(
        controlPlaneDiagnostics.controlPlaneOperations,
      ) ?
        controlPlaneDiagnostics.controlPlaneOperations :
        [];
      for (const operation of operations) {
        if (
          !operation ||
          typeof operation !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
        ) {
          continue;
        }
        controlPlaneOperations.push({
          snapshotNodeId,
          ...operation,
        });
      }
    }
  }

  if (
    Object.keys(publicationModeByNodeId).length === ZERO &&
    publicationConvergence === null &&
    Object.keys(heartbeatPublicationByNodeId).length === ZERO &&
    Object.keys(readinessByNodeId).length === ZERO &&
    Object.keys(nodeLivenessByNodeId).length === ZERO &&
    Object.keys(readinessTransitionsByNodeId).length === ZERO &&
    Object.keys(placementEligibilityByNodeId).length === ZERO &&
    Object.keys(workflowAdmissionsByWorkflowId).length === ZERO &&
    timeoutClassifications.length === ZERO &&
    participationDecisions.length === ZERO &&
    authoritativeReadinessRepairs.length === ZERO &&
    Object.keys(recoveryEpochsByNodeId).length === ZERO &&
    controlPlaneOperations.length === ZERO &&
    startupRecovery === null &&
    priorityRecoveryObservation === null &&
    priorityRecoveryDecisionSnapshots === null &&
    priorityRecoveryInvariants === null &&
    directDiagnostics === null &&
    directActiveGateDiagnostics === null &&
    directActiveGatePublicationGate === null &&
    directActiveGatePublicationConvergence === null
  ) {
    return null;
  }

  return {
    publicationModeByNodeId,
    publicationConvergence,
    heartbeatPublicationByNodeId,
    readinessByNodeId,
    nodeLivenessByNodeId,
    readinessTransitionsByNodeId,
    placementEligibilityByNodeId,
    workflowAdmissionsByWorkflowId,
    timeoutClassifications,
    participationDecisions,
    authoritativeReadinessRepairs,
    recoveryEpochsByNodeId,
    controlPlaneOperations,
    startupRecovery,
    priorityRecoveryObservation,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryInvariants,
    ...(directDiagnostics || {}),
    ...(directActiveGatePublicationConvergence ?
      {publicationConvergence: directActiveGatePublicationConvergence} :
      {}),
    ...(directActiveGatePublicationGate ?
      {publicationConvergenceGate: directActiveGatePublicationGate} :
      {}),
    ...(directActiveGateDiagnostics || {}),
  };
}

function mergeTransitionHistory(existingEntries, nextEntries) {
  const merged = [];
  const seen = new Set();
  for (const entry of [
    ...(Array.isArray(existingEntries) ? existingEntries : []),
    ...(Array.isArray(nextEntries) ? nextEntries : []),
  ]) {
    if (!entry || typeof entry !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT) {
      continue;
    }
    const signature = JSON.stringify({
      nodeId: entry.nodeId || null,
      observedAtMs: Number(entry.observedAtMs || ZERO),
      serveEligible: entry.serveEligible === true,
      repairEligible: entry.repairEligible === true,
      reasonCodes: Array.isArray(entry.reasonCodes) ? entry.reasonCodes : [],
    });
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    merged.push(entry);
  }
  merged.sort(
    (left, right) =>
      Number(left?.observedAtMs || ZERO) - Number(right?.observedAtMs || ZERO),
  );
  return merged;
}

function resolveControlSnapshot(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const snapshotsByNodeId = diagnostics?.rootCauseBundle?.snapshotsByNodeId;
  if (
    snapshotsByNodeId &&
    typeof snapshotsByNodeId === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
  ) {
    return snapshotsByNodeId;
  }
  return null;
}

function resolveAdminQueryTraceByNodeId(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const traceByNodeId = diagnostics?.rootCauseBundle?.adminQueryTraceByNodeId;
  if (
    traceByNodeId &&
    typeof traceByNodeId === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
  ) {
    return traceByNodeId;
  }
  return null;
}

function resolveLoadMetrics(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  if (
    diagnostics?.loadMetrics &&
    typeof diagnostics.loadMetrics === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT &&
    !Array.isArray(diagnostics.loadMetrics)
  ) {
    return diagnostics.loadMetrics;
  }
  if (
    entry?.loadMetrics &&
    typeof entry.loadMetrics === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT &&
    !Array.isArray(entry.loadMetrics)
  ) {
    return entry.loadMetrics;
  }
  return null;
}

function extractNodeIdsFromText(value) {
  const nodeIds = [];
  const matches = String(value || EMPTY_STRING).matchAll(
    NODE_ID_ERROR_PATTERN,
  );
  for (const match of matches) {
    const nodeId = String(match?.[ONE] || EMPTY_STRING);
    if (nodeId.length > ZERO) {
      nodeIds.push(nodeId);
    }
  }
  return nodeIds;
}

function resolveRelevantNodeIds(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const loadMetrics = resolveLoadMetrics(entry);
  const affectedNodeIds = Array.isArray(diagnostics?.failure?.affectedNodeIds) ?
    diagnostics.failure.affectedNodeIds :
    [];
  const nodeIds = new Set(affectedNodeIds);
  for (const snapshotNodeId of Object.keys(
    resolveControlSnapshot(entry) || {},
  )) {
    nodeIds.add(snapshotNodeId);
  }
  for (const traceNodeId of Object.keys(
    resolveAdminQueryTraceByNodeId(entry) || {},
  )) {
    nodeIds.add(traceNodeId);
  }
  const perNodeMetrics =
    loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' &&
    !Array.isArray(loadMetrics.perNode) ?
      loadMetrics.perNode :
      {};
  for (const [nodeId, nodeMetrics] of Object.entries(perNodeMetrics)) {
    const attemptedErrors = Number(nodeMetrics?.attemptErrors || ZERO);
    const dispatched = Number(nodeMetrics?.dispatched || ZERO);
    const success = Number(nodeMetrics?.success || ZERO);
    const rejected = Number(nodeMetrics?.rejected || ZERO);
    if (attemptedErrors > ZERO || dispatched > success || rejected > ZERO) {
      nodeIds.add(nodeId);
    }
  }
  const failedPhaseErrors = Array.isArray(diagnostics?.failedPhase?.errors) ?
    diagnostics.failedPhase.errors :
    [];
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  for (const errorText of [...failedPhaseErrors, ...distinctErrors]) {
    for (const nodeId of extractNodeIdsFromText(errorText)) {
      nodeIds.add(nodeId);
    }
  }
  return [...nodeIds];
}

function resolveTraceFailureTimestampMs(entry) {
  const candidates = [
    entry?.erroredAtMs,
    entry?.timeoutAtMs,
    entry?.resolvedAtMs,
    entry?.startedAtMs,
  ];
  for (const candidate of candidates) {
    const timestampMs = Number(candidate);
    if (Number.isFinite(timestampMs) && timestampMs > ZERO) {
      return timestampMs;
    }
  }
  return null;
}

function toIsoTimestamp(timestampMs) {
  return Number.isFinite(timestampMs) ?
    new Date(timestampMs).toISOString() :
    null;
}

function resolveWorkflowRelevantNodeIds(workflow) {
  const nodeIds = new Set();
  const addValues = (values) => {
    for (const value of Array.isArray(values) ? values : []) {
      const normalized = String(value || '');
      if (normalized.length > ZERO) {
        nodeIds.add(normalized);
      }
    }
  };
  addValues(workflow?.candidateTargetNodeIds);
  addValues(workflow?.sourceRoutableNodeIds);
  addValues(workflow?.eligibleNodeIds);
  for (const entry of Array.isArray(workflow?.ineligibleNodes) ?
    workflow.ineligibleNodes :
    []) {
    const nodeId = String(entry?.nodeId || '');
    if (nodeId.length > ZERO) {
      nodeIds.add(nodeId);
    }
  }
  const sourceLeaderNodeId = String(workflow?.sourceLeaderNodeId || '');
  if (sourceLeaderNodeId.length > ZERO) {
    nodeIds.add(sourceLeaderNodeId);
  }
  return [...nodeIds];
}

function resolveWorkflowStartTimestampMs(workflow) {
  const candidates = [
    workflow?.topologySnapshotCapturedAt,
    workflow?.admissionDecisionAt,
    workflow?.failedAt,
  ];
  for (const candidate of candidates) {
    const timestampMs = Date.parse(candidate);
    if (Number.isFinite(timestampMs)) {
      return timestampMs;
    }
  }
  return null;
}

function resolveWorkflowDeniedTimestampMs(workflow) {
  const transitionState = String(
    workflow?.transitionState || EMPTY_STRING,
  ).toLowerCase();
  if (
    transitionState !== WORKFLOW_DENIED_TRANSITION_STATE.BLOCKED &&
    transitionState !== WORKFLOW_DENIED_TRANSITION_STATE.DEFERRED
  ) {
    return null;
  }
  const timestampMs = Date.parse(workflow?.admissionDecisionAt);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function resolveWorkflowFailureTimestampMs(workflow) {
  const timestampMs = Date.parse(workflow?.failedAt);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function buildNodeTimelineCorrelation(entry, controlPlaneDiagnostics, nodeId) {
  const traceEntries = Array.isArray(
    resolveAdminQueryTraceByNodeId(entry)?.[nodeId],
  ) ?
    resolveAdminQueryTraceByNodeId(entry)[nodeId] :
    [];
  const loadFailureEntries = traceEntries
    .filter(
      (traceEntry) =>
        traceEntry?.lane === 'load' && traceEntry?.outcome !== 'success',
    )
    .map((traceEntry) => ({
      timestampMs: resolveTraceFailureTimestampMs(traceEntry),
      traceEntry,
    }))
    .filter((candidate) => Number.isFinite(candidate.timestampMs))
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const firstLoadFailure = loadFailureEntries[ZERO] || null;

  const readinessTransitions = Array.isArray(
    controlPlaneDiagnostics?.readinessTransitionsByNodeId?.[nodeId],
  ) ?
    [...controlPlaneDiagnostics.readinessTransitionsByNodeId[nodeId]] :
    [];
  readinessTransitions.sort(
    (left, right) =>
      Number(left?.observedAtMs || ZERO) - Number(right?.observedAtMs || ZERO),
  );
  const firstReadinessFlip = readinessTransitions[ZERO] || null;

  const relatedWorkflows = Object.values(
    controlPlaneDiagnostics?.workflowAdmissionsByWorkflowId || {},
  ).filter((workflow) =>
    resolveWorkflowRelevantNodeIds(workflow).includes(nodeId),
  );
  const splitStartTimestamps = relatedWorkflows
    .map((workflow) => resolveWorkflowStartTimestampMs(workflow))
    .filter((timestampMs) => Number.isFinite(timestampMs))
    .sort((left, right) => left - right);
  const splitDeniedTimestamps = relatedWorkflows
    .map((workflow) => resolveWorkflowDeniedTimestampMs(workflow))
    .filter((timestampMs) => Number.isFinite(timestampMs))
    .sort((left, right) => left - right);
  const splitFailureTimestamps = relatedWorkflows
    .map((workflow) => resolveWorkflowFailureTimestampMs(workflow))
    .filter((timestampMs) => Number.isFinite(timestampMs))
    .sort((left, right) => left - right);

  if (
    !firstLoadFailure &&
    !firstReadinessFlip &&
    splitStartTimestamps.length === ZERO &&
    splitDeniedTimestamps.length === ZERO &&
    splitFailureTimestamps.length === ZERO
  ) {
    return null;
  }

  const heartbeatAgeMsAtFirstReadinessFlip = Number(
    firstReadinessFlip?.rawInputs?.heartbeatAgeMs,
  );
  const readyLeaseLagMsAtFirstReadinessFlip = Number(
    firstReadinessFlip?.rawInputs?.readyLeaseLagMs,
  );
  return {
    firstLoadFailureAtMs: firstLoadFailure?.timestampMs || null,
    firstLoadFailureAt: toIsoTimestamp(firstLoadFailure?.timestampMs || null),
    firstLoadFailureQueryId: firstLoadFailure?.traceEntry?.queryId || null,
    firstReadinessFlipAtMs:
      Number(firstReadinessFlip?.observedAtMs || ZERO) || null,
    firstReadinessFlipAt: firstReadinessFlip?.observedAt || null,
    heartbeatAgeMsAtFirstReadinessFlip: Number.isFinite(
      heartbeatAgeMsAtFirstReadinessFlip,
    ) ?
      heartbeatAgeMsAtFirstReadinessFlip :
      null,
    readyLeaseLagMsAtFirstReadinessFlip: Number.isFinite(
      readyLeaseLagMsAtFirstReadinessFlip,
    ) ?
      readyLeaseLagMsAtFirstReadinessFlip :
      null,
    firstSplitStartedAtMs:
      splitStartTimestamps.length > ZERO ? splitStartTimestamps[ZERO] : null,
    firstSplitStartedAt:
      splitStartTimestamps.length > ZERO ?
        toIsoTimestamp(splitStartTimestamps[ZERO]) :
        null,
    firstSplitRejectedAtMs:
      splitDeniedTimestamps.length > ZERO ? splitDeniedTimestamps[ZERO] : null,
    firstSplitRejectedAt:
      splitDeniedTimestamps.length > ZERO ?
        toIsoTimestamp(splitDeniedTimestamps[ZERO]) :
        null,
    firstSplitFailedAtMs:
      splitFailureTimestamps.length > ZERO ?
        splitFailureTimestamps[ZERO] :
        null,
    firstSplitFailedAt:
      splitFailureTimestamps.length > ZERO ?
        toIsoTimestamp(splitFailureTimestamps[ZERO]) :
        null,
    relatedWorkflowIds: relatedWorkflows.map((workflow) => workflow.workflowId),
  };
}

function buildTimelineCorrelationByNodeId(
  entry,
  controlPlaneDiagnostics = null,
) {
  const correlations = {};
  for (const nodeId of resolveRelevantNodeIds(entry)) {
    const correlation = buildNodeTimelineCorrelation(
      entry,
      controlPlaneDiagnostics,
      nodeId,
    );
    if (correlation) {
      correlations[nodeId] = correlation;
    }
  }
  return correlations;
}

async function collectScenarioLogArtifacts(
  scenarioDir,
  relevantNodeIds,
  workspaceRoot,
  entry,
) {
  const result = {
    scenarioDirPath: toWorkspaceRelative(scenarioDir, workspaceRoot),
    timelinePath: null,
    analysisPath: null,
    playbackEventsPath: null,
    playbackEventSummary: null,
    firstFaultTimeline: null,
    playbackReadiness: null,
    restartBoundariesByNodeId: null,
    playbackControlPlane: null,
    playbackControlSnapshotByNodeId: null,
    nodeLogPaths: {},
    excerptsByNodeId: {},
    decisionArtifactsByNodeId: {},
  };
  let entries = [];
  try {
    entries = await readdir(scenarioDir, {withFileTypes: true});
  } catch (_error) {
    return result;
  }

  const nodeLogCandidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name === TIMELINE_FILENAME) {
      result.timelinePath = toWorkspaceRelative(
        join(scenarioDir, entry.name),
        workspaceRoot,
      );
      continue;
    }
    if (entry.name === ANALYSIS_FILENAME) {
      result.analysisPath = toWorkspaceRelative(
        join(scenarioDir, entry.name),
        workspaceRoot,
      );
      continue;
    }
    if (entry.name.endsWith(LOG_FILE_EXTENSION)) {
      nodeLogCandidates.push(entry.name);
    }
  }

  const preferredNodeIds =
    relevantNodeIds.length > ZERO ?
      relevantNodeIds :
      nodeLogCandidates.map((entryName) =>
        entryName.slice(ZERO, -LOG_FILE_EXTENSION.length),
      );

  await Promise.all(
    preferredNodeIds.map(async (nodeId) => {
      const filename = sanitizePathSegment(nodeId) + LOG_FILE_EXTENSION;
      const absolutePath = join(scenarioDir, filename);
      try {
        const content = await readFile(absolutePath, UTF8_ENCODING);
        result.nodeLogPaths[nodeId] = toWorkspaceRelative(
          absolutePath,
          workspaceRoot,
        );
        result.excerptsByNodeId[nodeId] = sliceLogTail(content);
        const decisionArtifacts =
          extractDecisionArtifactsFromLogContent(content);
        if (decisionArtifacts) {
          result.decisionArtifactsByNodeId[nodeId] = decisionArtifacts;
        }
      } catch (_error) {
        // Best effort: missing per-node logs are allowed.
      }
    }),
  );

  const playbackInsights = await collectPlaybackEventInsights(
    scenarioDir,
    workspaceRoot,
  );
  if (playbackInsights) {
    result.playbackEventsPath = playbackInsights.playbackEventsPath;
    result.playbackEventSummary = playbackInsights.playbackEventSummary || null;
    result.firstFaultTimeline = playbackInsights.firstFaultTimeline || null;
    result.playbackReadiness = playbackInsights.readiness || null;
    result.restartBoundariesByNodeId =
      playbackInsights.restartBoundariesByNodeId || null;
    result.playbackControlPlane = playbackInsights.controlPlaneFallback || null;
    result.playbackControlSnapshotByNodeId =
      playbackInsights.controlSnapshotByNodeId || null;
  }

  const playbackSnapshotInsights = await collectPlaybackSnapshotInsights(
    scenarioDir,
    entry,
  );
  if (playbackSnapshotInsights?.controlPlaneFallback) {
    const mergedPlaybackControlPlane = {
      ...(isRecord(result.playbackControlPlane) ? result.playbackControlPlane : {}),
      ...playbackSnapshotInsights.controlPlaneFallback,
      priorityRecoveryDecisionSnapshots: mergePriorityRecoveryDecisionSnapshots(
        playbackSnapshotInsights.controlPlaneFallback.priorityRecoveryDecisionSnapshots,
        result.playbackControlPlane?.priorityRecoveryDecisionSnapshots || null,
      ),
    };
    result.playbackControlPlane = mergedPlaybackControlPlane;
  }

  const logPriorityRecoveryObservation =
    buildPriorityRecoveryObservationFromDecisionArtifactsByNodeId(
      result.decisionArtifactsByNodeId,
    );
  result.playbackControlPlane = mergePlaybackPriorityRecoveryObservation(
    result.playbackControlPlane,
    logPriorityRecoveryObservation,
  );

  return result;
}

function mergeByNodeIdMaps(primaryMap, fallbackMap) {
  const hasPrimary = isRecord(primaryMap);
  const hasFallback = isRecord(fallbackMap);
  if (!hasPrimary && !hasFallback) {
    return null;
  }
  return {
    ...(hasFallback ? fallbackMap : {}),
    ...(hasPrimary ? primaryMap : {}),
  };
}

export const FAILURE_BUNDLE_SEGMENT_3 = {
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
  PLAYBACK_STAGE_LOAD_READINESS_STABLE,
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
};
