import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  buildPriorityRecoveryObservationFromDecisionArtifactsByNodeId,
  collectPlaybackEventInsights,
  collectPlaybackSnapshotInsights,
  mergePlaybackPriorityRecoveryObservation,
} from './failure-bundle-playback-insights.js';
import {FAILURE_BUNDLE_SEGMENT_2} from './failure-bundle-segment-2.js';
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
} = FAILURE_BUNDLE_SEGMENT_2;

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

export {
  collectScenarioLogArtifacts,
  mergeByNodeIdMaps,
};
