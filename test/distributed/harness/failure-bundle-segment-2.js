import {
  PRIORITY_RECOVERY_INVARIANT_FALLBACK,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import { FAILURE_BUNDLE_SEGMENT_1 } from "./failure-bundle-segment-1.js";
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
} = FAILURE_BUNDLE_SEGMENT_1;

function normalizePriorityRecoveryInvariants(value) {
  if (!isRecord(value)) {
    return null;
  }
  const invariantsById = new Map();
  for (const invariant of Array.isArray(value.invariants)
    ? value.invariants
    : []) {
    if (!isRecord(invariant)) {
      continue;
    }
    const invariantId = String(invariant.id || "").trim();
    if (invariantId.length === ZERO) {
      continue;
    }
    invariantsById.set(invariantId, {
      id: invariantId,
      invariantId:
        typeof invariant.invariantId === "string" &&
        invariant.invariantId.length > ZERO
          ? invariant.invariantId
          : invariantId,
      reasonCode:
        typeof invariant.reasonCode === "string" &&
        invariant.reasonCode.length > ZERO
          ? invariant.reasonCode
          : typeof invariant.code === "string" && invariant.code.length > ZERO
            ? invariant.code
            : PRIORITY_RECOVERY_INVARIANT_FALLBACK,
      severity:
        typeof invariant.severity === "string" &&
        invariant.severity.length > ZERO
          ? invariant.severity
          : null,
      scope:
        typeof invariant.scope === "string" && invariant.scope.length > ZERO
          ? invariant.scope
          : null,
      owningSubsystem:
        typeof invariant.owningSubsystem === "string" &&
        invariant.owningSubsystem.length > ZERO
          ? invariant.owningSubsystem
          : null,
      passed: invariant.passed === true,
      details: isRecord(invariant.details)
        ? cloneJsonValue(invariant.details)
        : null,
    });
  }
  const failingInvariantIds = normalizeDistinctStringArray([
    ...Array.from(invariantsById.values())
      .filter((invariant) => invariant.passed !== true)
      .map((invariant) => invariant.id),
    ...normalizeDistinctStringArray(value.failingInvariantIds),
  ]);

  return {
    invariants: [...invariantsById.values()],
    failingInvariantIds,
    passed: failingInvariantIds.length === ZERO,
  };
}

function mergePriorityRecoveryInvariants(primary, fallback) {
  const normalizedPrimary = normalizePriorityRecoveryInvariants(primary);
  const normalizedFallback = normalizePriorityRecoveryInvariants(fallback);
  if (!normalizedPrimary && !normalizedFallback) {
    return null;
  }
  if (!normalizedPrimary) {
    return normalizedFallback;
  }
  if (!normalizedFallback) {
    return normalizedPrimary;
  }

  const invariantsById = new Map();
  for (const source of [normalizedFallback, normalizedPrimary]) {
    for (const invariant of source.invariants) {
      invariantsById.set(invariant.id, invariant);
    }
  }
  const failingInvariantIds = normalizeDistinctStringArray([
    ...normalizedFallback.failingInvariantIds,
    ...normalizedPrimary.failingInvariantIds,
    ...Array.from(invariantsById.values())
      .filter((invariant) => invariant.passed !== true)
      .map((invariant) => invariant.id),
  ]);
  return {
    invariants: [...invariantsById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    failingInvariantIds,
    passed: failingInvariantIds.length === ZERO,
  };
}

function summarizePriorityRecoveryDecisionSnapshots(value) {
  const decisionSnapshots = normalizePriorityRecoveryDecisionSnapshots(value);
  if (!decisionSnapshots) {
    return null;
  }
  const partitionIdsByReason = {};
  const partitionIdsBySemanticState = {};
  const blockerReasonHistoryByPartitionId = {};
  const semanticStateHistoryByPartitionId = {};
  const decisionDimensions = new Set();
  for (const progressClassId of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    partitionIdsByReason[progressClassId] = new Set();
  }
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }

  for (const snapshot of decisionSnapshots.snapshots) {
    const partitionId = String(snapshot.partitionId || "").trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    if (!Array.isArray(blockerReasonHistoryByPartitionId[partitionId])) {
      blockerReasonHistoryByPartitionId[partitionId] = [];
    }
    for (const blockerReason of normalizeDistinctStringArray(
      snapshot.blockerReasons,
    )) {
      if (!(partitionIdsByReason[blockerReason] instanceof Set)) {
        partitionIdsByReason[blockerReason] = new Set();
      }
      partitionIdsByReason[blockerReason].add(partitionId);
      blockerReasonHistoryByPartitionId[partitionId].push(blockerReason);
    }
    if (!Array.isArray(semanticStateHistoryByPartitionId[partitionId])) {
      semanticStateHistoryByPartitionId[partitionId] = [];
    }
    const semanticState =
      normalizePriorityRecoverySemanticStateId(snapshot.semanticState) ||
      inferPriorityRecoverySemanticState(
        snapshot,
        normalizeDistinctStringArray(snapshot.blockerReasons),
      );
    if (partitionIdsBySemanticState[semanticState] instanceof Set) {
      partitionIdsBySemanticState[semanticState].add(partitionId);
    }
    semanticStateHistoryByPartitionId[partitionId].push(semanticState);
    const decisionDimension = String(
      snapshot?.admission?.decisionDimension || "",
    ).trim();
    if (decisionDimension.length > ZERO) {
      decisionDimensions.add(decisionDimension);
    }
  }

  const blockerPartitionIdsByReason = {};
  const unresolvedClassIds = [];
  const blockedPartitionIds = new Set();
  for (const [blockerReason, partitionIds] of Object.entries(
    partitionIdsByReason,
  )) {
    blockerPartitionIdsByReason[blockerReason] = [...partitionIds].sort();
    if (partitionIds.size > ZERO) {
      unresolvedClassIds.push(blockerReason);
      for (const partitionId of partitionIds) {
        blockedPartitionIds.add(partitionId);
      }
    }
  }
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = [
      ...partitionIds,
    ].sort();
  }
  const unresolvedSemanticStateIds =
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter(
      (semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState].length > ZERO,
    );
  const blockedPartitionIdsBySemanticState = new Set();
  for (const semanticState of unresolvedSemanticStateIds) {
    for (const partitionId of normalizedPartitionIdsBySemanticState[
      semanticState
    ]) {
      blockedPartitionIdsBySemanticState.add(partitionId);
    }
  }
  const effectiveBlockedPartitionIds =
    blockedPartitionIdsBySemanticState.size > ZERO
      ? [...blockedPartitionIdsBySemanticState].sort()
      : [...blockedPartitionIds].sort();

  const partitionBlockerHistory = Object.entries(
    blockerReasonHistoryByPartitionId,
  )
    .map(([partitionId, blockerReasons]) => ({
      partitionId,
      blockerReasons: normalizeDistinctStringArray(blockerReasons),
    }))
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
  const partitionSemanticStateHistory = Object.entries(
    semanticStateHistoryByPartitionId,
  )
    .map(([partitionId, semanticStates]) => ({
      partitionId,
      semanticStates: normalizeDistinctStringArray(semanticStates),
    }))
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
  const selectLatestPriorityRecoveryPartitionSnapshot = (partitionSnapshots) =>
    partitionSnapshots
      .filter((snapshot) => isRecord(snapshot))
      .sort((left, right) => {
        const leftUpdatedAtMs = Number(
          left?.coordinator?.operation?.updatedAtMs ??
            left?.observation?.provenance?.capturedAt ??
            decisionSnapshots?.capturedAt ??
            ZERO,
        );
        const rightUpdatedAtMs = Number(
          right?.coordinator?.operation?.updatedAtMs ??
            right?.observation?.provenance?.capturedAt ??
            decisionSnapshots?.capturedAt ??
            ZERO,
        );
        if (leftUpdatedAtMs !== rightUpdatedAtMs) {
          return rightUpdatedAtMs - leftUpdatedAtMs;
        }
        const leftEpoch = Number.isFinite(left?.epoch) ? left.epoch : ZERO;
        const rightEpoch = Number.isFinite(right?.epoch) ? right.epoch : ZERO;
        if (leftEpoch !== rightEpoch) {
          return rightEpoch - leftEpoch;
        }
        return String(right?.correlationKey || "").localeCompare(
          String(left?.correlationKey || ""),
        );
      })[0] || null;
  const partitionWitnesses = effectiveBlockedPartitionIds
    .map((partitionId) => {
      const partitionSnapshots = decisionSnapshots.snapshots.filter(
        (snapshot) =>
          String(snapshot?.partitionId || "").trim() === partitionId,
      );
      const latestPartitionSnapshot =
        selectLatestPriorityRecoveryPartitionSnapshot(partitionSnapshots);
      const blockerReasons = normalizeDistinctStringArray(
        latestPartitionSnapshot?.blockerReasons,
      );
      const semanticState =
        normalizePriorityRecoverySemanticStateId(
          latestPartitionSnapshot?.semanticState,
        ) ||
        inferPriorityRecoverySemanticState(
          latestPartitionSnapshot,
          blockerReasons,
        );
      const decisionDimension =
        String(
          latestPartitionSnapshot?.admission?.decisionDimension || "",
        ).trim() || null;
      const effectiveEligibleNodeIds = Array.isArray(
        latestPartitionSnapshot?.admission?.effectiveEligibleNodeIds,
      )
        ? latestPartitionSnapshot.admission.effectiveEligibleNodeIds
        : [];
      const eligibleNodeIds =
        effectiveEligibleNodeIds.length > ZERO ?
          normalizeDistinctStringArray(effectiveEligibleNodeIds) :
          normalizeDistinctStringArray(
            latestPartitionSnapshot?.admission?.eligibleNodeIds,
          );
      const excludedNodeIds = normalizeDistinctStringArray(
        latestPartitionSnapshot?.admission?.recoveryEligibleExcludedNodeIds,
      );
      const activeLearnerNodeIds = normalizeDistinctStringArray(
        latestPartitionSnapshot?.readiness?.learnerPromotion
          ?.activeLearnerNodeIds,
      );
      const promotableLearnerNodeIds = normalizeDistinctStringArray(
        latestPartitionSnapshot?.readiness?.learnerPromotion
          ?.promotableLearnerNodeIds,
      );
      const operationIds = normalizeDistinctStringArray(
        partitionSnapshots.flatMap((snapshot) =>
          Array.isArray(snapshot?.coordinator?.operationIds)
            ? snapshot.coordinator.operationIds
            : [],
        ),
      );
      const spreadGap = Number.isFinite(
        latestPartitionSnapshot?.planner?.spreadGap,
      ) ?
        Number(latestPartitionSnapshot.planner.spreadGap) :
        partitionSnapshots
          .map((snapshot) => Number(snapshot?.planner?.spreadGap))
          .filter((value) => Number.isFinite(value))
          .reduce((maximum, value) => Math.max(maximum, value), ZERO);
      const latestOperation = isRecord(
        latestPartitionSnapshot?.coordinator?.operation,
      ) ?
        latestPartitionSnapshot.coordinator.operation :
        partitionSnapshots
          .map((snapshot) => snapshot?.coordinator?.operation)
          .filter((operation) => isRecord(operation))
          .sort(
            (left, right) =>
              Number(right.updatedAtMs || ZERO) -
              Number(left.updatedAtMs || ZERO),
          )[0] || null;

      return {
        partitionId,
        semanticState: semanticState || null,
        blockerReasons,
        spreadGap,
        decisionDimension,
        eligibleNodeCount: eligibleNodeIds.length,
        recoveryEligibleExcludedNodeIds: excludedNodeIds,
        activeLearnerNodeIds,
        promotableLearnerNodeIds,
        operationIds,
        completionState:
          String(latestPartitionSnapshot?.completion?.state || "").trim() ||
          null,
        workflowState:
          String(latestPartitionSnapshot?.observation?.workflowState || "")
            .trim() || null,
        visibilityState:
          String(latestPartitionSnapshot?.observation?.visibilityState || "")
            .trim() || null,
        convergenceState:
          String(latestPartitionSnapshot?.observation?.convergenceState || "")
            .trim() || null,
        workflowSource:
          String(
            latestPartitionSnapshot?.observation?.provenance?.workflowSource ||
              "",
          ).trim() || null,
        snapshotCapturedAt: Number.isFinite(
          latestPartitionSnapshot?.observation?.provenance?.capturedAt,
        ) ?
          Math.floor(
            latestPartitionSnapshot.observation.provenance.capturedAt,
          ) :
          Number.isFinite(decisionSnapshots?.capturedAt) ?
            Math.floor(decisionSnapshots.capturedAt) :
          null,
        latestOperationWorkflowStep:
          String(latestOperation?.workflowStep || "").trim() || null,
        latestOperationStatus:
          String(latestOperation?.status || "").trim() || null,
        latestOperationTimelineStep:
          String(latestOperation?.latestTimelineStep || "").trim() || null,
      };
    })
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));

  return {
    schemaVersion: decisionSnapshots.schemaVersion,
    publicationEpoch: decisionSnapshots.publicationEpoch,
    snapshotCount: decisionSnapshots.snapshotCount,
    partitionCount: decisionSnapshots.partitionCount,
    unresolvedClassIds: unresolvedClassIds.sort(),
    unresolvedClassCount: unresolvedClassIds.length,
    unresolvedSemanticStateIds,
    unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
    blockedPartitionIds: effectiveBlockedPartitionIds,
    blockedPartitionCount: effectiveBlockedPartitionIds.length,
    blockerPartitionIdsByReason,
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    partitionBlockerHistory,
    partitionSemanticStateHistory,
    partitionWitnesses,
    admissionDecisionDimensions: [...decisionDimensions].sort(),
  };
}

function deriveReasonCountsFromLoadMetrics(loadMetrics) {
  if (!isRecord(loadMetrics)) {
    return {};
  }
  const waitReasons = isRecord(loadMetrics.waitReasons)
    ? loadMetrics.waitReasons
    : {};
  const reasonCounts = {};
  for (const key of LOAD_WAIT_REASON_KEYS) {
    const count = normalizeNonNegativeCount(waitReasons[key]);
    if (count !== null && count > ZERO) {
      reasonCounts[key] = count;
    }
  }
  const hardFailures = resolveCanonicalFailedOperationCount(loadMetrics);
  if (hardFailures > ZERO) {
    reasonCounts.hardLoadFailures = hardFailures;
  }
  return reasonCounts;
}

function deriveReasonCountsFromReadiness(nodeReasonsByNodeId) {
  if (!isRecord(nodeReasonsByNodeId)) {
    return {};
  }
  const reasonCounts = {};
  for (const reasons of Object.values(nodeReasonsByNodeId)) {
    for (const reason of Array.isArray(reasons) ? reasons : []) {
      const normalizedReason = String(reason || "").trim();
      if (normalizedReason.length === ZERO) {
        continue;
      }
      if (!Object.hasOwn(reasonCounts, normalizedReason)) {
        reasonCounts[normalizedReason] = ZERO;
      }
      reasonCounts[normalizedReason] += 1;
    }
  }
  return reasonCounts;
}

function resolveRootCauseClassFromReason(reason) {
  const normalizedReason = String(reason || "").trim();
  if (normalizedReason.length === ZERO) {
    return null;
  }
  if (normalizedReason.startsWith("closure_witness_")) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  if (Object.hasOwn(LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON, normalizedReason)) {
    return LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON[normalizedReason];
  }
  if (normalizedReason === "hardLoadFailures") {
    return ROOT_CAUSE_CLASS_LOAD;
  }

  const lowered = normalizedReason.toLowerCase();
  if (lowered.includes("cdc")) {
    return ROOT_CAUSE_CLASS_CDC;
  }
  if (lowered.includes("cache")) {
    return ROOT_CAUSE_CLASS_CACHE;
  }
  if (
    lowered.includes("query_transport") ||
    lowered.includes("readiness") ||
    lowered.includes("bootstrap") ||
    lowered.includes("join_ready") ||
    lowered.includes("metadata_publication")
  ) {
    return ROOT_CAUSE_CLASS_STARTUP;
  }
  if (
    lowered.includes("topology") ||
    lowered.includes("leader") ||
    lowered.includes("partition") ||
    lowered.includes("replica")
  ) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  if (
    lowered.includes("routing") ||
    lowered.includes("discovery") ||
    lowered.includes("service") ||
    lowered.includes("schema")
  ) {
    return ROOT_CAUSE_CLASS_DISCOVERY;
  }
  if (
    lowered.includes("publication") ||
    lowered.includes("priority_recovery") ||
    lowered.includes("priority_spread") ||
    lowered.includes("operation_created_but_no_step_transitions") ||
    lowered.includes("replica_operations") ||
    lowered.includes("recovery_protocol")
  ) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  if (
    lowered.includes("load") ||
    lowered.includes("queue") ||
    lowered.includes("dispatch") ||
    lowered.includes("timeout") ||
    lowered.includes("admission") ||
    lowered.includes("failed")
  ) {
    return ROOT_CAUSE_CLASS_LOAD;
  }
  return null;
}

function resolveRootCauseClass({
  rootCauseClass,
  dominantReason,
  reasonCounts,
  loadMetrics,
  firstFaultTimeline,
  readiness,
  controlPlane,
}) {
  if (typeof rootCauseClass === "string" && rootCauseClass.length > ZERO) {
    return rootCauseClass;
  }

  const fromDominantReason = resolveRootCauseClassFromReason(dominantReason);
  if (fromDominantReason) {
    return fromDominantReason;
  }
  for (const reason of Object.keys(reasonCounts || {})) {
    const fromReason = resolveRootCauseClassFromReason(reason);
    if (fromReason) {
      return fromReason;
    }
  }
  if (resolveCanonicalFailedOperationCount(loadMetrics) > ZERO) {
    return ROOT_CAUSE_CLASS_LOAD;
  }
  const orderedMarkers = Array.isArray(firstFaultTimeline?.orderedMarkers)
    ? firstFaultTimeline.orderedMarkers
    : [];
  const earliestMarker =
    orderedMarkers.length > ZERO ? orderedMarkers[ZERO].marker : null;
  if (
    earliestMarker === FIRST_FAULT_MARKER_QUEUE_PRESSURE ||
    earliestMarker === FIRST_FAULT_MARKER_ATTEMPT_ERRORS ||
    earliestMarker === FIRST_FAULT_MARKER_HARD_FAILURE
  ) {
    return ROOT_CAUSE_CLASS_LOAD;
  }
  if (
    isRecord(readiness?.nodeReasonsByNodeId) &&
    Object.keys(readiness.nodeReasonsByNodeId).length > ZERO
  ) {
    return ROOT_CAUSE_CLASS_STARTUP;
  }
  if (
    Array.isArray(controlPlane?.timeoutClassifications) &&
    controlPlane.timeoutClassifications.length > ZERO
  ) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  return ROOT_CAUSE_CLASS_UNKNOWN;
}

function resolveSummaryRootCauseClass(failure, failureClassification) {
  const failureRootCauseClass = String(failure?.rootCauseClass || "").trim();
  const classificationRootCauseClass = String(
    failureClassification?.rootCauseClass || "",
  ).trim();
  if (
    failureRootCauseClass.length > ZERO &&
    failureRootCauseClass !== ROOT_CAUSE_CLASS_UNKNOWN
  ) {
    return failureRootCauseClass;
  }
  if (
    classificationRootCauseClass.length > ZERO &&
    classificationRootCauseClass !== ROOT_CAUSE_CLASS_UNKNOWN
  ) {
    return classificationRootCauseClass;
  }
  if (failureRootCauseClass.length > ZERO) {
    return failureRootCauseClass;
  }
  if (classificationRootCauseClass.length > ZERO) {
    return classificationRootCauseClass;
  }
  return null;
}

function normalizeAffectedNodeIds(entry, fallbackNodeIds = []) {
  const explicitNodeIds = Array.isArray(
    resolveFailureDiagnostics(entry)?.failure?.affectedNodeIds,
  )
    ? resolveFailureDiagnostics(entry).failure.affectedNodeIds
    : [];
  const sourceNodeIds =
    explicitNodeIds.length > ZERO ? explicitNodeIds : fallbackNodeIds;
  return sourceNodeIds
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > ZERO)
    .slice(ZERO, AFFECTED_NODE_ID_LIMIT);
}

function toIsoTimestamp(timestampMs) {
  return Number.isFinite(timestampMs)
    ? new Date(timestampMs).toISOString()
    : null;
}

function buildMarker(timestampMs, loadStartAtMs) {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return {
    atMs: timestampMs,
    at: toIsoTimestamp(timestampMs),
    deltaFromLoadStartMs: Number.isFinite(loadStartAtMs)
      ? Math.max(ZERO, Math.floor(timestampMs - loadStartAtMs))
      : null,
  };
}

function resolveLoadMetricsFromPlaybackEvent(event) {
  const metrics = event?.details?.metrics;
  return isRecord(metrics) ? metrics : null;
}

function resolveLoadQueuePressureSignalCount(loadMetrics) {
  if (!isRecord(loadMetrics)) {
    return ZERO;
  }
  const waitReasons = isRecord(loadMetrics.waitReasons)
    ? loadMetrics.waitReasons
    : {};
  let signalCount = ZERO;
  for (const key of [
    LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
    LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED,
    LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED,
  ]) {
    signalCount += normalizeNonNegativeCount(waitReasons[key]) || ZERO;
  }
  return signalCount;
}

function buildFirstFaultTimelineFromPlaybackEvents(events) {
  const sortedEvents = [...(Array.isArray(events) ? events : [])]
    .filter((event) => isRecord(event))
    .sort(
      (left, right) =>
        Number(left.timestamp || ZERO) - Number(right.timestamp || ZERO),
    );
  const loadStart = sortedEvents.find(
    (event) => event.type === PLAYBACK_EVENT_TYPE_LOAD_STARTED,
  );
  const loadStartAtMs = normalizeNonNegativeCount(loadStart?.timestamp);
  if (loadStartAtMs === null) {
    return null;
  }
  let queuePressureOnsetAtMs = null;
  let attemptErrorOnsetAtMs = null;
  let hardFailureOnsetAtMs = null;

  for (const event of sortedEvents) {
    if (
      event.type !== PLAYBACK_EVENT_TYPE_LOAD_PROGRESS &&
      event.type !== PLAYBACK_EVENT_TYPE_LOAD_COMPLETED
    ) {
      continue;
    }
    const timestampMs = normalizeNonNegativeCount(event?.timestamp);
    if (timestampMs === null) {
      continue;
    }
    const metrics = resolveLoadMetricsFromPlaybackEvent(event);
    if (!metrics) {
      continue;
    }
    if (
      queuePressureOnsetAtMs === null &&
      resolveLoadQueuePressureSignalCount(metrics) > ZERO
    ) {
      queuePressureOnsetAtMs = timestampMs;
    }
    if (
      attemptErrorOnsetAtMs === null &&
      (normalizeNonNegativeCount(metrics.attemptErrors) || ZERO) > ZERO
    ) {
      attemptErrorOnsetAtMs = timestampMs;
    }
    if (
      hardFailureOnsetAtMs === null &&
      resolveCanonicalFailedOperationCount(metrics) > ZERO
    ) {
      hardFailureOnsetAtMs = timestampMs;
    }
  }

  const markers = {
    [FIRST_FAULT_MARKER_QUEUE_PRESSURE]: buildMarker(
      queuePressureOnsetAtMs,
      loadStartAtMs,
    ),
    [FIRST_FAULT_MARKER_ATTEMPT_ERRORS]: buildMarker(
      attemptErrorOnsetAtMs,
      loadStartAtMs,
    ),
    [FIRST_FAULT_MARKER_HARD_FAILURE]: buildMarker(
      hardFailureOnsetAtMs,
      loadStartAtMs,
    ),
  };
  const orderedMarkers = Object.entries(markers)
    .filter(([, marker]) => marker && Number.isFinite(marker.atMs))
    .map(([marker, value]) => ({
      marker,
      ...value,
    }))
    .sort((left, right) => left.atMs - right.atMs);

  if (orderedMarkers.length === ZERO) {
    return null;
  }
  return {
    loadStartAtMs,
    loadStartAt: toIsoTimestamp(loadStartAtMs),
    markers,
    orderedMarkers,
  };
}

function buildPlaybackEventSummary(events) {
  const sortedEvents = [...(Array.isArray(events) ? events : [])]
    .filter((event) => isRecord(event))
    .sort(
      (left, right) =>
        Number(left.timestamp || ZERO) - Number(right.timestamp || ZERO),
    );
  if (sortedEvents.length === ZERO) {
    return null;
  }

  const clusterStages = [];
  const recentTopologyEvents = [];
  let loadStartedAtMs = null;
  let loadCompletedAtMs = null;
  let loadProgressEventCount = ZERO;
  let lastLoadMetrics = null;
  let partitionCreatedCount = ZERO;
  let replicaCreatedCount = ZERO;
  let replicaRemovedCount = ZERO;

  for (const event of sortedEvents) {
    const timestampMs = normalizeNonNegativeCount(event?.timestamp);
    const details = isRecord(event?.details) ? event.details : {};
    if (event.type === PLAYBACK_EVENT_TYPE_CLUSTER_STAGE) {
      clusterStages.push({
        timestampMs,
        timestamp: toIsoTimestamp(timestampMs),
        stage:
          typeof details.stage === "string" ? details.stage : UNKNOWN_VALUE,
        nodeId: typeof details.nodeId === "string" ? details.nodeId : null,
        attempts: normalizeNonNegativeCount(details.attempts),
        elapsedMs: normalizeNonNegativeCount(details.elapsedMs),
      });
      continue;
    }

    if (event.type === PLAYBACK_EVENT_TYPE_LOAD_STARTED) {
      loadStartedAtMs = timestampMs;
      lastLoadMetrics =
        resolveLoadMetricsFromPlaybackEvent(event) || lastLoadMetrics;
      continue;
    }
    if (event.type === PLAYBACK_EVENT_TYPE_LOAD_PROGRESS) {
      loadProgressEventCount += 1;
      lastLoadMetrics =
        resolveLoadMetricsFromPlaybackEvent(event) || lastLoadMetrics;
      continue;
    }
    if (event.type === PLAYBACK_EVENT_TYPE_LOAD_COMPLETED) {
      loadCompletedAtMs = timestampMs;
      lastLoadMetrics =
        resolveLoadMetricsFromPlaybackEvent(event) || lastLoadMetrics;
      continue;
    }

    if (event.type === PLAYBACK_EVENT_TYPE_PARTITION_CREATED) {
      partitionCreatedCount += 1;
    } else if (event.type === PLAYBACK_EVENT_TYPE_REPLICA_CREATED) {
      replicaCreatedCount += 1;
    } else if (event.type === PLAYBACK_EVENT_TYPE_REPLICA_REMOVED) {
      replicaRemovedCount += 1;
    } else {
      continue;
    }

    recentTopologyEvents.push({
      type: event.type,
      timestampMs,
      timestamp: toIsoTimestamp(timestampMs),
      entityId: typeof event?.entityId === "string" ? event.entityId : null,
      partitionId:
        typeof details.partitionId === "string" ? details.partitionId : null,
      nodeId:
        typeof details.nodeId === "string"
          ? details.nodeId
          : typeof details.targetNodeId === "string"
            ? details.targetNodeId
            : null,
      status: typeof details.status === "string" ? details.status : null,
      tableName:
        typeof details.tableName === "string" ? details.tableName : null,
      tableId: typeof details.tableId === "string" ? details.tableId : null,
    });
  }

  return {
    eventCount: sortedEvents.length,
    clusterStages: clusterStages.slice(-TRIAGE_CLUSTER_STAGE_LIMIT),
    load: {
      startedAtMs: loadStartedAtMs,
      startedAt: toIsoTimestamp(loadStartedAtMs),
      completedAtMs: loadCompletedAtMs,
      completedAt: toIsoTimestamp(loadCompletedAtMs),
      progressEventCount: loadProgressEventCount,
      lastMetrics: lastLoadMetrics || null,
    },
    topology: {
      partitionCreatedCount,
      replicaCreatedCount,
      replicaRemovedCount,
      recentEvents: recentTopologyEvents.slice(
        -TRIAGE_RECENT_TOPOLOGY_EVENT_LIMIT,
      ),
    },
  };
}

function buildReadinessFromPlaybackEvents(events) {
  const sortedEvents = [...(Array.isArray(events) ? events : [])]
    .filter((event) => isRecord(event))
    .sort(
      (left, right) =>
        Number(left.timestamp || ZERO) - Number(right.timestamp || ZERO),
    );
  const nodeReasonsByNodeId = {};
  let lastReadinessTimelineEntry = null;

  for (const event of sortedEvents) {
    if (event.type !== PLAYBACK_EVENT_TYPE_CLUSTER_STAGE) {
      continue;
    }
    const nodeDiagnostics = Array.isArray(event?.details?.nodeDiagnostics)
      ? event.details.nodeDiagnostics
      : [];
    if (nodeDiagnostics.length === ZERO) {
      continue;
    }
    const nodeReasonCountsByNodeId = {};
    for (const nodeDiagnostic of nodeDiagnostics) {
      const nodeId = String(nodeDiagnostic?.nodeId || "").trim();
      if (nodeId.length === ZERO) {
        continue;
      }
      const reasons = Array.isArray(nodeDiagnostic?.reasons)
        ? nodeDiagnostic.reasons
            .map((reason) => String(reason || "").trim())
            .filter((reason) => reason.length > ZERO)
        : [];
      nodeReasonCountsByNodeId[nodeId] = reasons.length;
      if (reasons.length === ZERO) {
        continue;
      }
      if (!Object.hasOwn(nodeReasonsByNodeId, nodeId)) {
        if (
          Object.keys(nodeReasonsByNodeId).length >= READINESS_REASON_MAX_NODES
        ) {
          continue;
        }
        nodeReasonsByNodeId[nodeId] = [];
      }
      for (const reason of reasons) {
        if (nodeReasonsByNodeId[nodeId].includes(reason)) {
          continue;
        }
        nodeReasonsByNodeId[nodeId].push(reason);
        if (
          nodeReasonsByNodeId[nodeId].length >= READINESS_REASON_MAX_PER_NODE
        ) {
          break;
        }
      }
    }
    lastReadinessTimelineEntry = {
      timestampMs: normalizeNonNegativeCount(event?.timestamp),
      timestamp: toIsoTimestamp(normalizeNonNegativeCount(event?.timestamp)),
      stage: String(event?.details?.stage || ""),
      nodeReasonCountsByNodeId,
    };
  }

  if (
    Object.keys(nodeReasonsByNodeId).length === ZERO &&
    !lastReadinessTimelineEntry
  ) {
    return null;
  }
  return {
    nodeReasonsByNodeId:
      Object.keys(nodeReasonsByNodeId).length > ZERO
        ? nodeReasonsByNodeId
        : null,
    lastReadinessTimelineEntry,
  };
}

function cloneJsonValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry));
  }
  if (typeof value !== "object") {
    return value;
  }
  const cloned = {};
  for (const [key, entry] of Object.entries(value)) {
    cloned[key] = cloneJsonValue(entry);
  }
  return cloned;
}

function resolvePlaybackPublicationConvergence(details) {
  const snapshotCoverage =
    details?.snapshotCoverage && typeof details.snapshotCoverage === "object"
      ? details.snapshotCoverage
      : null;
  if (!snapshotCoverage) {
    return null;
  }
  if (
    snapshotCoverage.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === "object"
  ) {
    return cloneJsonValue(snapshotCoverage.selectedPublicationConvergence);
  }
  if (
    snapshotCoverage.selectedPublishedMembershipObservation &&
    typeof snapshotCoverage.selectedPublishedMembershipObservation === "object"
  ) {
    return cloneJsonValue(
      snapshotCoverage.selectedPublishedMembershipObservation,
    );
  }
  return null;
}

function resolvePlaybackPublishedMembershipObservation(details) {
  const snapshotCoverage =
    details?.snapshotCoverage && typeof details.snapshotCoverage === "object"
      ? details.snapshotCoverage
      : null;
  if (
    !snapshotCoverage ||
    !snapshotCoverage.selectedPublishedMembershipObservation ||
    typeof snapshotCoverage.selectedPublishedMembershipObservation !== "object"
  ) {
    return null;
  }
  return cloneJsonValue(
    snapshotCoverage.selectedPublishedMembershipObservation,
  );
}

function scorePlaybackActiveGateDetails(details) {
  if (!details || typeof details !== "object") {
    return Number.NEGATIVE_INFINITY;
  }
  const snapshotCoverage =
    details.snapshotCoverage && typeof details.snapshotCoverage === "object"
      ? details.snapshotCoverage
      : null;
  const publicationConvergenceGate =
    details.publicationConvergenceGate &&
    typeof details.publicationConvergenceGate === "object"
      ? details.publicationConvergenceGate
      : null;
  const bestCoverageNodeCount = Number.isFinite(
    snapshotCoverage?.bestCoverageNodeCount,
  )
    ? Math.max(ZERO, Math.floor(snapshotCoverage.bestCoverageNodeCount))
    : ZERO;
  const hasPublicationConvergence =
    snapshotCoverage?.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === "object";
  const hasPublishedMembershipObservation =
    snapshotCoverage?.selectedPublishedMembershipObservation &&
    typeof snapshotCoverage.selectedPublishedMembershipObservation === "object";
  const hasPriorityPartitionSummary =
    (snapshotCoverage?.selectedPublicationConvergence
      ?.priorityPartitionSummary &&
      typeof snapshotCoverage.selectedPublicationConvergence
        .priorityPartitionSummary === "object") ||
    (publicationConvergenceGate?.priorityPartitionSummary &&
      typeof publicationConvergenceGate.priorityPartitionSummary === "object");
  const hasSelectedError =
    typeof snapshotCoverage?.selectedError === "string" &&
    snapshotCoverage.selectedError.length > ZERO;
  const hasActiveGateProgress =
    details.activeGateProgress &&
    typeof details.activeGateProgress === "object";
  const hasActiveGateNoProgress =
    details.activeGateNoProgress &&
    typeof details.activeGateNoProgress === "object";
  const hasActiveGateBlockerHistory =
    Array.isArray(details.activeGateBlockerHistory) &&
    details.activeGateBlockerHistory.length > ZERO;
  const hasPriorityRecoveryDecisionSnapshots =
    details?.snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots &&
    typeof details.snapshotCoverage
      .selectedPriorityRecoveryDecisionSnapshots === "object";
  const hasPriorityRecoveryInvariants =
    details.priorityRecoveryInvariants &&
    typeof details.priorityRecoveryInvariants === "object";
  return (
    (snapshotCoverage?.completeCoverage === true ? 100000 : ZERO) +
    bestCoverageNodeCount * 1000 +
    (hasPublicationConvergence ? 400 : ZERO) +
    (hasPublishedMembershipObservation ? 300 : ZERO) +
    (publicationConvergenceGate ? 200 : ZERO) +
    (hasPriorityPartitionSummary ? 100 : ZERO) +
    (hasActiveGateProgress ? 80 : ZERO) +
    (hasActiveGateNoProgress ? 40 : ZERO) +
    (hasActiveGateBlockerHistory ? 20 : ZERO) +
    (hasPriorityRecoveryDecisionSnapshots ? 40 : ZERO) +
    (hasPriorityRecoveryInvariants ? 20 : ZERO) +
    (hasSelectedError ? -50 : ZERO)
  );
}

export const FAILURE_BUNDLE_SEGMENT_2 = {
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
};
