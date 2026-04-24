import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPriorityRecoveryDecisionSnapshots as buildSharedPriorityRecoveryDecisionSnapshots } from '../../../src/control-plane/priority-recovery-snapshot.js';
import {
  deriveLegacyPriorityRecoveryActiveGateFields,
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';
import { FAILURE_BUNDLE_SEGMENT_2 } from "./failure-bundle-segment-2.js";
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
} = FAILURE_BUNDLE_SEGMENT_2;

const PLAYBACK_PRIORITY_RECOVERY_SNAPSHOT_FIELD = Object.freeze({
  REPLICA_OPERATIONS: 'replicaOperations',
  ROWS: 'rows',
  SERVICES: 'services',
  TIMESTAMP: 'timestamp',
});
const PLAYBACK_STAGE_SETUP_CLUSTER_ACTIVE = 'setup.cluster.active';

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
      event?.details && typeof event.details === "object"
        ? event.details
        : null;
    if (
      !details ||
      (
        details.stage !== PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE &&
        details.stage !== PLAYBACK_STAGE_SETUP_CLUSTER_ACTIVE
      )
    ) {
      continue;
    }
    const hasSnapshotCoverage =
      details.snapshotCoverage && typeof details.snapshotCoverage === "object";
    const hasPublicationGate =
      details.publicationConvergenceGate &&
      typeof details.publicationConvergenceGate === "object";
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
    typeof selectedActiveGateDetails.publicationConvergenceGate === "object"
      ? cloneJsonValue(selectedActiveGateDetails.publicationConvergenceGate)
      : null;
  const snapshotCoverage =
    selectedActiveGateDetails.snapshotCoverage &&
    typeof selectedActiveGateDetails.snapshotCoverage === "object"
      ? cloneJsonValue(selectedActiveGateDetails.snapshotCoverage)
      : null;
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot(
    selectedActiveGateDetails,
  );
  const legacyActiveGateFields = deriveLegacyPriorityRecoveryActiveGateFields(
    activeGate,
  );
  const priorityRecoveryDecisionSnapshots =
    selectedActiveGateDetails?.snapshotCoverage &&
    typeof selectedActiveGateDetails.snapshotCoverage === "object" &&
    isRecord(
      selectedActiveGateDetails.snapshotCoverage
        .selectedPriorityRecoveryDecisionSnapshots,
    )
      ? cloneJsonValue(
          selectedActiveGateDetails.snapshotCoverage
            .selectedPriorityRecoveryDecisionSnapshots,
        )
      : null;
  const priorityRecoveryInvariants =
    selectedActiveGateDetails.priorityRecoveryInvariants &&
    typeof selectedActiveGateDetails.priorityRecoveryInvariants === "object"
      ? cloneJsonValue(selectedActiveGateDetails.priorityRecoveryInvariants)
      : null;

  const readinessByNodeId = {};
  const nodeDiagnostics = Array.isArray(
    selectedActiveGateDetails.nodeDiagnostics,
  )
    ? selectedActiveGateDetails.nodeDiagnostics
    : [];
  for (const nodeDiagnostic of nodeDiagnostics) {
    const nodeId = String(nodeDiagnostic?.nodeId || "").trim();
    if (nodeId.length === ZERO) {
      continue;
    }
    const reasonCodes = Array.isArray(nodeDiagnostic?.reasons)
      ? nodeDiagnostic.reasons
          .map((reason) => String(reason || "").trim())
          .filter((reason) => reason.length > ZERO)
      : [];
    readinessByNodeId[nodeId] = {
      nodeId,
      reasons: reasonCodes.map((code) => ({ code })),
    };
  }

  const controlPlaneFallback = {
    publicationConvergence,
    publicationConvergenceGate,
    publishedMembershipObservation,
    activeGateSnapshotCoverage: snapshotCoverage,
    ...(activeGate ? {activeGate} : {}),
    ...legacyActiveGateFields,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryInvariants,
    readinessByNodeId:
      Object.keys(readinessByNodeId).length > ZERO ? readinessByNodeId : null,
    activeGateObservedAtMs: selectedActiveGateTimestampMs,
    activeGateObservedAt: toIsoTimestamp(selectedActiveGateTimestampMs),
  };

  const selectedSnapshotNodeId = String(
    snapshotCoverage?.selectedNodeId || "",
  ).trim();
  const selectedCapturedAtMs = normalizeNonNegativeCount(
    snapshotCoverage?.selectedCapturedAtMs,
  );
  const observedNodeIds = Array.isArray(
    snapshotCoverage?.selectedObservedNodeIds,
  )
    ? snapshotCoverage.selectedObservedNodeIds
        .map((nodeId) => String(nodeId || "").trim())
        .filter((nodeId) => nodeId.length > ZERO)
    : [];
  const controlSnapshotByNodeId =
    selectedSnapshotNodeId.length > ZERO
      ? {
          [selectedSnapshotNodeId]: {
            nodeId: selectedSnapshotNodeId,
            capturedAtMs: selectedCapturedAtMs,
            capturedAt: toIsoTimestamp(selectedCapturedAtMs),
            observedNodeIds,
            source: "playback_active_gate",
            controlPlaneDiagnostics: {
              publicationConvergence,
              publishedMembershipObservation,
              priorityRecoveryDecisionSnapshots,
              priorityRecoveryInvariants,
            },
          },
        }
      : null;

  return {
    controlPlaneFallback,
    controlSnapshotByNodeId,
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
      event?.entityId || event?.details?.snapshot?.nodeId || "",
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
        typeof event?.details?.phase === "string"
          ? event.details.phase
          : UNKNOWN_VALUE,
      snapshot: isRecord(event?.details?.snapshot)
        ? event.details.snapshot
        : null,
      error:
        typeof event?.details?.error === "string" ? event.details.error : null,
    });
  }
  return Object.keys(restartBoundariesByNodeId).length > ZERO
    ? restartBoundariesByNodeId
    : null;
}

async function collectPlaybackEventInsights(scenarioDir, workspaceRoot) {
  const playbackEventsAbsolutePath = join(
    scenarioDir,
    PLAYBACK_EVENTS_FILENAME,
  );
  try {
    const content = await readFile(playbackEventsAbsolutePath, UTF8_ENCODING);
    const events = String(content || "")
      .split("\n")
      .map((line) => String(line || "").trim())
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
  return String(rawContent || '')
    .split('\n')
    .map((line) => String(line || '').trim())
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
  const readinessTimeline = Array.isArray(failedArtifacts.readinessTimeline)
    ? failedArtifacts.readinessTimeline
    : Array.isArray(failedArtifacts?.gateResult?.readinessTimeline)
      ? failedArtifacts.gateResult.readinessTimeline
      : [];
  const artifactNodeReasonsByNodeId = isRecord(
    failedArtifacts.nodeReasonsByNodeId,
  )
    ? failedArtifacts.nodeReasonsByNodeId
    : null;
  const failureNodeReasonsByNodeId = isRecord(
    diagnostics?.failure?.nodeReasonsByNodeId,
  )
    ? diagnostics.failure.nodeReasonsByNodeId
    : null;
  const playbackNodeReasonsByNodeId = isRecord(
    playbackReadiness?.nodeReasonsByNodeId,
  )
    ? playbackReadiness.nodeReasonsByNodeId
    : null;
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
      readinessTimeline.length > ZERO
        ? readinessTimeline[readinessTimeline.length - 1]
        : playbackReadiness?.lastReadinessTimelineEntry || null,
  };
}

function resolveControlPlaneDiagnostics(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const directLedgerSnapshotsByNodeId =
    diagnostics?.rootCauseBundle?.controlPlaneLedgerSnapshotsByNodeId &&
    typeof diagnostics.rootCauseBundle.controlPlaneLedgerSnapshotsByNodeId ===
      "object"
      ? diagnostics.rootCauseBundle.controlPlaneLedgerSnapshotsByNodeId
      : null;
  const snapshotsByNodeId = resolveControlSnapshot(entry);
  const directDiagnosticsFromEntry = isRecord(
    entry?.details?.diagnostics?.controlPlaneDiagnostics,
  )
    ? entry.details.diagnostics.controlPlaneDiagnostics
    : null;
  const directDiagnosticsFromRootCause = isRecord(
    diagnostics?.rootCauseBundle?.controlPlaneDiagnostics,
  )
    ? diagnostics.rootCauseBundle.controlPlaneDiagnostics
    : null;
  const directDiagnostics =
    directDiagnosticsFromEntry ||
    directDiagnosticsFromRootCause ||
    (isRecord(diagnostics?.controlPlaneDiagnostics)
      ? diagnostics.controlPlaneDiagnostics
      : null);
  const directDiagnosticSnapshotNodeIdCandidate = String(
    diagnostics?.snapshotNodeId || directDiagnostics?.snapshotNodeId || "",
  ).trim();
  const directDiagnosticSnapshotNodeId =
    directDiagnosticSnapshotNodeIdCandidate.length > ZERO
      ? directDiagnosticSnapshotNodeIdCandidate
      : UNKNOWN_VALUE;
  const directDiagnosticSources = directDiagnostics
    ? {
        [directDiagnosticSnapshotNodeId]: {
          controlPlaneDiagnostics: directDiagnostics,
        },
      }
    : null;
  const publicationModeByNodeId = {};
  const heartbeatPublicationByNodeId = {};
  let publicationConvergence =
    directDiagnostics?.publicationConvergence &&
    typeof directDiagnostics.publicationConvergence === "object"
      ? directDiagnostics.publicationConvergence
      : null;
  let priorityRecoveryObservation =
    directDiagnostics?.priorityRecoveryObservation &&
    typeof directDiagnostics.priorityRecoveryObservation === "object"
      ? directDiagnostics.priorityRecoveryObservation
      : null;
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
    typeof directDiagnostics.startupRecovery === "object"
      ? directDiagnostics.startupRecovery
      : null;

  const diagnosticSources =
    directLedgerSnapshotsByNodeId &&
    Object.keys(directLedgerSnapshotsByNodeId).length > ZERO
      ? directLedgerSnapshotsByNodeId
      : snapshotsByNodeId && Object.keys(snapshotsByNodeId).length > ZERO
        ? snapshotsByNodeId
        : directDiagnosticSources;

  if (diagnosticSources && typeof diagnosticSources === "object") {
    for (const [snapshotNodeId, snapshot] of Object.entries(
      diagnosticSources,
    )) {
      const controlPlaneDiagnostics =
        snapshot?.controlPlaneDiagnostics &&
        typeof snapshot.controlPlaneDiagnostics === "object"
          ? snapshot.controlPlaneDiagnostics
          : null;
      if (!controlPlaneDiagnostics) {
        continue;
      }

      if (
        controlPlaneDiagnostics.publicationMode &&
        typeof controlPlaneDiagnostics.publicationMode === "object"
      ) {
        publicationModeByNodeId[snapshotNodeId] =
          controlPlaneDiagnostics.publicationMode;
      }
      if (
        !publicationConvergence &&
        controlPlaneDiagnostics.publicationConvergence &&
        typeof controlPlaneDiagnostics.publicationConvergence === "object"
      ) {
        publicationConvergence = controlPlaneDiagnostics.publicationConvergence;
      }
      if (
        !priorityRecoveryObservation &&
        controlPlaneDiagnostics.priorityRecoveryObservation &&
        typeof controlPlaneDiagnostics.priorityRecoveryObservation === "object"
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
        typeof controlPlaneDiagnostics.heartbeatPublication === "object"
      ) {
        heartbeatPublicationByNodeId[snapshotNodeId] =
          controlPlaneDiagnostics.heartbeatPublication;
      }
      if (
        !startupRecovery &&
        controlPlaneDiagnostics.startupRecovery &&
        typeof controlPlaneDiagnostics.startupRecovery === "object"
      ) {
        startupRecovery = controlPlaneDiagnostics.startupRecovery;
      }

      const readiness =
        controlPlaneDiagnostics.readinessByNodeId &&
        typeof controlPlaneDiagnostics.readinessByNodeId === "object"
          ? controlPlaneDiagnostics.readinessByNodeId
          : {};
      Object.assign(readinessByNodeId, readiness);

      const nodeLiveness =
        controlPlaneDiagnostics.nodeLivenessByNodeId &&
        typeof controlPlaneDiagnostics.nodeLivenessByNodeId === "object"
          ? controlPlaneDiagnostics.nodeLivenessByNodeId
          : {};
      Object.assign(nodeLivenessByNodeId, nodeLiveness);

      const readinessTransitions =
        controlPlaneDiagnostics.readinessTransitionsByNodeId &&
        typeof controlPlaneDiagnostics.readinessTransitionsByNodeId === "object"
          ? controlPlaneDiagnostics.readinessTransitionsByNodeId
          : {};
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
        typeof controlPlaneDiagnostics.placementEligibilityByNodeId === "object"
          ? controlPlaneDiagnostics.placementEligibilityByNodeId
          : {};
      Object.assign(placementEligibilityByNodeId, placement);

      const workflows =
        controlPlaneDiagnostics.workflowAdmissionsByWorkflowId &&
        typeof controlPlaneDiagnostics.workflowAdmissionsByWorkflowId ===
          "object"
          ? controlPlaneDiagnostics.workflowAdmissionsByWorkflowId
          : {};
      Object.assign(workflowAdmissionsByWorkflowId, workflows);

      const timeouts = Array.isArray(
        controlPlaneDiagnostics.timeoutClassifications,
      )
        ? controlPlaneDiagnostics.timeoutClassifications
        : [];
      for (const timeout of timeouts) {
        if (!timeout || typeof timeout !== "object") {
          continue;
        }
        timeoutClassifications.push({
          snapshotNodeId,
          ...timeout,
        });
      }

      const decisions = Array.isArray(
        controlPlaneDiagnostics.participationDecisions,
      )
        ? controlPlaneDiagnostics.participationDecisions
        : [];
      for (const decision of decisions) {
        if (!decision || typeof decision !== "object") {
          continue;
        }
        participationDecisions.push({
          snapshotNodeId,
          ...decision,
        });
      }

      const repairs = Array.isArray(
        controlPlaneDiagnostics.authoritativeReadinessRepairs,
      )
        ? controlPlaneDiagnostics.authoritativeReadinessRepairs
        : [];
      for (const repair of repairs) {
        if (!repair || typeof repair !== "object") {
          continue;
        }
        authoritativeReadinessRepairs.push({
          snapshotNodeId,
          ...repair,
        });
      }

      const recoveryEpochs =
        controlPlaneDiagnostics.recoveryEpochsByNodeId &&
        typeof controlPlaneDiagnostics.recoveryEpochsByNodeId === "object"
          ? controlPlaneDiagnostics.recoveryEpochsByNodeId
          : {};
      for (const [nodeId, epochs] of Object.entries(recoveryEpochs)) {
        const existing = Array.isArray(recoveryEpochsByNodeId[nodeId])
          ? recoveryEpochsByNodeId[nodeId]
          : [];
        recoveryEpochsByNodeId[nodeId] = [
          ...existing,
          ...(Array.isArray(epochs)
            ? epochs.map((epoch) => ({
                snapshotNodeId,
                ...epoch,
              }))
            : []),
        ];
      }

      const operations = Array.isArray(
        controlPlaneDiagnostics.controlPlaneOperations,
      )
        ? controlPlaneDiagnostics.controlPlaneOperations
        : [];
      for (const operation of operations) {
        if (!operation || typeof operation !== "object") {
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
    directDiagnostics === null
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
  };
}

function mergeTransitionHistory(existingEntries, nextEntries) {
  const merged = [];
  const seen = new Set();
  for (const entry of [
    ...(Array.isArray(existingEntries) ? existingEntries : []),
    ...(Array.isArray(nextEntries) ? nextEntries : []),
  ]) {
    if (!entry || typeof entry !== "object") {
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
  if (snapshotsByNodeId && typeof snapshotsByNodeId === "object") {
    return snapshotsByNodeId;
  }
  return null;
}

function resolveAdminQueryTraceByNodeId(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const traceByNodeId = diagnostics?.rootCauseBundle?.adminQueryTraceByNodeId;
  if (traceByNodeId && typeof traceByNodeId === "object") {
    return traceByNodeId;
  }
  return null;
}

function resolveLoadMetrics(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  if (
    diagnostics?.loadMetrics &&
    typeof diagnostics.loadMetrics === "object" &&
    !Array.isArray(diagnostics.loadMetrics)
  ) {
    return diagnostics.loadMetrics;
  }
  if (
    entry?.loadMetrics &&
    typeof entry.loadMetrics === "object" &&
    !Array.isArray(entry.loadMetrics)
  ) {
    return entry.loadMetrics;
  }
  return null;
}

function extractNodeIdsFromText(value) {
  const nodeIds = [];
  const matches = String(value || "").matchAll(NODE_ID_ERROR_PATTERN);
  for (const match of matches) {
    const nodeId = String(match?.[1] || "");
    if (nodeId.length > ZERO) {
      nodeIds.push(nodeId);
    }
  }
  return nodeIds;
}

function resolveRelevantNodeIds(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const loadMetrics = resolveLoadMetrics(entry);
  const affectedNodeIds = Array.isArray(diagnostics?.failure?.affectedNodeIds)
    ? diagnostics.failure.affectedNodeIds
    : [];
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
    typeof loadMetrics.perNode === "object" &&
    !Array.isArray(loadMetrics.perNode)
      ? loadMetrics.perNode
      : {};
  for (const [nodeId, nodeMetrics] of Object.entries(perNodeMetrics)) {
    const attemptedErrors = Number(nodeMetrics?.attemptErrors || ZERO);
    const dispatched = Number(nodeMetrics?.dispatched || ZERO);
    const success = Number(nodeMetrics?.success || ZERO);
    const rejected = Number(nodeMetrics?.rejected || ZERO);
    if (attemptedErrors > ZERO || dispatched > success || rejected > ZERO) {
      nodeIds.add(nodeId);
    }
  }
  const failedPhaseErrors = Array.isArray(diagnostics?.failedPhase?.errors)
    ? diagnostics.failedPhase.errors
    : [];
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors)
    ? loadMetrics.distinctErrors
    : [];
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
  return Number.isFinite(timestampMs)
    ? new Date(timestampMs).toISOString()
    : null;
}

function resolveWorkflowRelevantNodeIds(workflow) {
  const nodeIds = new Set();
  const addValues = (values) => {
    for (const value of Array.isArray(values) ? values : []) {
      const normalized = String(value || "");
      if (normalized.length > ZERO) {
        nodeIds.add(normalized);
      }
    }
  };
  addValues(workflow?.candidateTargetNodeIds);
  addValues(workflow?.sourceRoutableNodeIds);
  addValues(workflow?.eligibleNodeIds);
  for (const entry of Array.isArray(workflow?.ineligibleNodes)
    ? workflow.ineligibleNodes
    : []) {
    const nodeId = String(entry?.nodeId || "");
    if (nodeId.length > ZERO) {
      nodeIds.add(nodeId);
    }
  }
  const sourceLeaderNodeId = String(workflow?.sourceLeaderNodeId || "");
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
  const transitionState = String(workflow?.transitionState || "").toLowerCase();
  if (transitionState !== "blocked" && transitionState !== "deferred") {
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
  )
    ? resolveAdminQueryTraceByNodeId(entry)[nodeId]
    : [];
  const loadFailureEntries = traceEntries
    .filter(
      (traceEntry) =>
        traceEntry?.lane === "load" && traceEntry?.outcome !== "success",
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
  )
    ? [...controlPlaneDiagnostics.readinessTransitionsByNodeId[nodeId]]
    : [];
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
    )
      ? heartbeatAgeMsAtFirstReadinessFlip
      : null,
    readyLeaseLagMsAtFirstReadinessFlip: Number.isFinite(
      readyLeaseLagMsAtFirstReadinessFlip,
    )
      ? readyLeaseLagMsAtFirstReadinessFlip
      : null,
    firstSplitStartedAtMs:
      splitStartTimestamps.length > ZERO ? splitStartTimestamps[ZERO] : null,
    firstSplitStartedAt:
      splitStartTimestamps.length > ZERO
        ? toIsoTimestamp(splitStartTimestamps[ZERO])
        : null,
    firstSplitRejectedAtMs:
      splitDeniedTimestamps.length > ZERO ? splitDeniedTimestamps[ZERO] : null,
    firstSplitRejectedAt:
      splitDeniedTimestamps.length > ZERO
        ? toIsoTimestamp(splitDeniedTimestamps[ZERO])
        : null,
    firstSplitFailedAtMs:
      splitFailureTimestamps.length > ZERO
        ? splitFailureTimestamps[ZERO]
        : null,
    firstSplitFailedAt:
      splitFailureTimestamps.length > ZERO
        ? toIsoTimestamp(splitFailureTimestamps[ZERO])
        : null,
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
    entries = await readdir(scenarioDir, { withFileTypes: true });
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
    relevantNodeIds.length > ZERO
      ? relevantNodeIds
      : nodeLogCandidates.map((entryName) =>
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
};
