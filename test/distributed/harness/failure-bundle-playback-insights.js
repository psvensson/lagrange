import {readFile} from 'node:fs/promises';
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
import {
  resolveControlPlaneDiagnostics,
  toIsoTimestamp,
} from './failure-bundle-control-plane-diagnostics.js';
import {FAILURE_BUNDLE_SEGMENT_2} from './failure-bundle-segment-2.js';
const {
  PLAYBACK_EVENTS_FILENAME,
  PLAYBACK_SNAPSHOTS_FILENAME,
  PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
  PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY,
  PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  PLAYBACK_STAGE_LOAD_READINESS_WAITING,
  PLAYBACK_STAGE_LOAD_READINESS_STABLE,
  UTF8_ENCODING,
  ZERO,
  UNKNOWN_VALUE,
  toWorkspaceRelative,
  isRecord,
  normalizeNonNegativeCount,
  buildPriorityRecoveryCorrelationKey,
  cloneJsonValue,
  resolvePlaybackPublicationConvergence,
  resolvePlaybackPublishedMembershipObservation,
  scorePlaybackActiveGateDetails,
  buildPlaybackEventSummary,
  buildFirstFaultTimelineFromPlaybackEvents,
  buildReadinessFromPlaybackEvents,
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
const FAILURE_BUNDLE_SEGMENT_TYPE = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
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


export {
  buildPlaybackControlPlaneFallback,
  buildPriorityRecoveryObservationFromDecisionArtifactsByNodeId,
  mergePlaybackPriorityRecoveryObservation,
  buildRestartBoundariesFromPlaybackEvents,
  collectPlaybackEventInsights,
  collectPlaybackSnapshotInsights,
};
