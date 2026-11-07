import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  buildPriorityRecoveryObservationFromDecisionArtifactsByNodeId,
  collectPlaybackEventInsights,
  collectPlaybackSnapshotInsights,
  mergePlaybackPriorityRecoveryObservation,
} from './failure-bundle-playback-insights.js';
import {FAILURE_BUNDLE_PLAYBACK_CLASSIFICATION} from './failure-bundle-playback-classification.js';
const {
  TIMELINE_FILENAME,
  ANALYSIS_FILENAME,
  UTF8_ENCODING,
  ZERO,
  LOG_FILE_EXTENSION,
  toWorkspaceRelative,
  sanitizePathSegment,
  sliceLogTail,
  extractDecisionArtifactsFromLogContent,
  isRecord,
  mergePriorityRecoveryDecisionSnapshots,
} = FAILURE_BUNDLE_PLAYBACK_CLASSIFICATION;

// The scenario directory is shared by every run of the scenario under one
// output root, so a directory listing is not this run's evidence. Only the
// nodes this run's own event stream created (node.created) are read; a
// listing is used only when no event stream names the run's nodes.
const stringTrim = Function.call.bind(String.prototype.trim);

function trimText(value) {
  return typeof value === 'string' ? stringTrim(value) : '';
}

function firstCoordinatorOperationId(coordinator) {
  const operationIds = coordinator?.operationIds;
  return Array.isArray(operationIds) ? trimText(operationIds[ZERO]) : '';
}

function resolveSnapshotOperationId(snapshot) {
  if (!isRecord(snapshot)) {
    return null;
  }
  const coordinatorOp = snapshot?.coordinator?.operation;
  const candidates = [
    snapshot.operationId,
    snapshot.operation_id,
    coordinatorOp?.operationId,
    coordinatorOp?.operation_id,
    firstCoordinatorOperationId(snapshot.coordinator),
  ];
  for (const candidate of candidates) {
    const trimmed = trimText(candidate);
    if (trimmed.length > ZERO) {
      return trimmed;
    }
  }
  return null;
}

function collectPrimaryOperationIdsByPartitionId(primarySnapshots) {
  const byPartitionId = new Map();
  const snapshots = isRecord(primarySnapshots) &&
    Array.isArray(primarySnapshots.snapshots) ?
    primarySnapshots.snapshots :
    [];
  for (const snapshot of snapshots) {
    const partitionId = trimText(snapshot?.partitionId);
    const operationId = resolveSnapshotOperationId(snapshot);
    if (partitionId.length === ZERO || !operationId) {
      continue;
    }
    let set = byPartitionId.get(partitionId);
    if (!set) {
      set = new Set();
      byPartitionId.set(partitionId, set);
    }
    set.add(operationId);
  }
  return byPartitionId;
}

function shouldKeepFallbackSnapshot(
  snapshot,
  terminalSet,
  primaryOperationIdsByPartitionId,
) {
  const operationId = resolveSnapshotOperationId(snapshot);
  if (!operationId) {
    return true;
  }
  if (terminalSet.has(operationId)) {
    return false;
  }
  const partitionId = trimText(snapshot?.partitionId);
  const activePrimaryIds = primaryOperationIdsByPartitionId.get(partitionId);
  return !activePrimaryIds ||
    activePrimaryIds.size === ZERO ||
    activePrimaryIds.has(operationId);
}

function reconcilePlaybackDecisionSnapshotsWithStartupFallback(
  primarySnapshots,
  fallbackSnapshots,
  terminalOperationIds = [],
) {
  if (!isRecord(fallbackSnapshots) || !Array.isArray(fallbackSnapshots.snapshots)) {
    return {primarySnapshots, fallbackSnapshots};
  }
  const terminalSet = new Set(
    Array.isArray(terminalOperationIds) ? terminalOperationIds : [],
  );
  const primaryOperationIdsByPartitionId =
    collectPrimaryOperationIdsByPartitionId(primarySnapshots);
  const prunedFallbackList = [];
  for (const snapshot of fallbackSnapshots.snapshots) {
    if (
      shouldKeepFallbackSnapshot(
        snapshot,
        terminalSet,
        primaryOperationIdsByPartitionId,
      )
    ) {
      prunedFallbackList.push(snapshot);
    }
  }

  return {
    primarySnapshots,
    fallbackSnapshots: {
      ...fallbackSnapshots,
      snapshots: prunedFallbackList,
      snapshotCount: prunedFallbackList.length,
    },
  };
}

function selectRunNodeLogIds(relevantNodeIds, nodeLogCandidates,
  playbackInsights) {
  if (relevantNodeIds.length > ZERO) {
    return relevantNodeIds;
  }
  const runNodeIds = playbackInsights?.playbackEventSummary?.runNodeIds;
  if (Array.isArray(runNodeIds) && runNodeIds.length > ZERO) {
    return runNodeIds;
  }
  const listed = [];
  for (const entryName of nodeLogCandidates) {
    listed.push(entryName.slice(ZERO, -LOG_FILE_EXTENSION.length));
  }
  return listed;
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

  const playbackInsights = await collectPlaybackEventInsights(
    scenarioDir,
    workspaceRoot,
  );
  const preferredNodeIds = selectRunNodeLogIds(
    relevantNodeIds,
    nodeLogCandidates,
    playbackInsights,
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
    result.playbackControlPlane,
  );
  if (playbackSnapshotInsights?.controlPlaneFallback) {
    const reconciledSnapshots =
      reconcilePlaybackDecisionSnapshotsWithStartupFallback(
        playbackSnapshotInsights.controlPlaneFallback
          .priorityRecoveryDecisionSnapshots,
        result.playbackControlPlane?.priorityRecoveryDecisionSnapshots || null,
        playbackSnapshotInsights.terminalOperationIds,
      );
    const mergedPriorityRecoveryDecisionSnapshots =
      mergePriorityRecoveryDecisionSnapshots(
        reconciledSnapshots.primarySnapshots,
        reconciledSnapshots.fallbackSnapshots,
      );
    const mergedPlaybackControlPlane = {
      ...(isRecord(result.playbackControlPlane) ? result.playbackControlPlane : {}),
      ...playbackSnapshotInsights.controlPlaneFallback,
      priorityRecoveryDecisionSnapshots:
        mergedPriorityRecoveryDecisionSnapshots,
    };
    result.playbackControlPlane = mergedPlaybackControlPlane;
    if (isRecord(result.playbackControlSnapshotByNodeId)) {
      for (const snapshotEntry of Object.values(
        result.playbackControlSnapshotByNodeId,
      )) {
        if (isRecord(snapshotEntry?.controlPlaneDiagnostics)) {
          snapshotEntry.controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots =
            mergedPriorityRecoveryDecisionSnapshots;
        }
      }
    }
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

export {
  collectScenarioLogArtifacts,
  mergeByNodeIdMaps,
};
