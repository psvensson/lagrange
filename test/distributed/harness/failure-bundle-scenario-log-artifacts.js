import {readdir, readFile} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';
import {
  buildPriorityRecoveryObservationFromDecisionArtifactsByNodeId,
  collectPlaybackEventInsights,
  collectPlaybackSnapshotInsights,
  mergePlaybackPriorityRecoveryObservation,
} from './failure-bundle-playback-insights.js';
import {FAILURE_BUNDLE_PLAYBACK_CLASSIFICATION} from './failure-bundle-playback-classification.js';
import {
  LOG_WINDOW_COVERAGE,
  summarizeLogWindowCoverage,
} from './failure-bundle-artifact-foundation.js';
import {retainNodeLogWindowFromGzip} from './failure-bundle-log-window.js';
import {
  CAPTURE_COMPLETENESS_NOT_RECORDED,
  fullLogDestPath,
} from './full-node-log-capture.js';
const {
  TIMELINE_FILENAME,
  ANALYSIS_FILENAME,
  UTF8_ENCODING,
  ZERO,
  LOG_FILE_EXTENSION,
  toWorkspaceRelative,
  sanitizePathSegment,
  extractDecisionArtifactsFromLogContent,
  isRecord,
  mergePriorityRecoveryDecisionSnapshots,
} = FAILURE_BUNDLE_PLAYBACK_CLASSIFICATION;

const arrayMap = Function.call.bind(Array.prototype.map);

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

// First divergence is the scenario step log's fact (the failed step's start,
// failure-bundle-playback-classification.js resolveScenarioRunFacts); without
// it the window falls back to the log's last bytes and says so.
function resolveFirstDivergenceAtMs(playbackInsights) {
  const startedAtMs =
    playbackInsights?.playbackEventSummary?.failedScenarioStep?.startedAtMs;
  return Number.isFinite(startedAtMs) ? startedAtMs : null;
}

// The capture owner's verdict on one node's full log, as the runner carried
// it from cluster teardown into the report entry (report-writer.js
// captureCompletenessByNodeId). A node with no verdict is NOT_RECORDED, which
// is never complete: the bundle does not re-derive it from the file.
function resolveCaptureCompleteness(entry, nodeId) {
  const recorded = entry?.captureCompletenessByNodeId?.[nodeId];
  return isRecord(recorded) ? recorded : CAPTURE_COMPLETENESS_NOT_RECORDED;
}

// The window comes from the node's FULL log, the complete source the cluster
// captured for the node's whole life (full-node-log-capture.js), never from
// the curated {scenario}/{nodeId}.log, which is a sample. The scenario dir is
// {outputDir}/{scenario}, so the full log is
// {outputDir}/.full-logs/{scenario}/{nodeId}.log.gz.
async function retainNodeFullLogWindow(scenarioDir, nodeId, workspaceRoot,
  windowOptions) {
  const gzPath = fullLogDestPath(
    dirname(scenarioDir), basename(scenarioDir), nodeId);
  return retainNodeLogWindowFromGzip(gzPath, {
    ...windowOptions,
    source: toWorkspaceRelative(gzPath, workspaceRoot),
  });
}

async function retainRunLogWindows(result, {
  scenarioDir, nodeIds, workspaceRoot, entry, playbackInsights,
  maxRetainedBytes,
}) {
  const firstDivergenceAtMs = resolveFirstDivergenceAtMs(playbackInsights);
  await Promise.all(arrayMap(nodeIds, async (nodeId) => {
    const logWindow = await retainNodeFullLogWindow(
      scenarioDir, nodeId, workspaceRoot, {
        firstDivergenceAtMs,
        maxRetainedBytes,
        captureCompleteness: resolveCaptureCompleteness(entry, nodeId),
      });
    result.excerptsByNodeId[nodeId] = logWindow.lines;
    result.logWindowCoverageByNodeId[nodeId] = logWindow.coverage;
  }));
  // The run's own event stream, when read, names every node it created: an
  // empty set then means no node, not unknown nodes.
  result.logWindowCoverage = summarizeLogWindowCoverage(
    result.logWindowCoverageByNodeId, {
      nodeIdsKnown:
        Array.isArray(playbackInsights?.playbackEventSummary?.runNodeIds),
    });
}

/**
 * Collect one scenario's log artifacts for its failure bundle.
 * @param {string} scenarioDir
 * @param {Array<string>} relevantNodeIds
 * @param {string} workspaceRoot
 * @param {Object} entry The scenario report entry.
 * @param {{retainLogWindows?: boolean, maxRetainedBytes?: number}} [options]
 *   retainLogWindows false skips the full-log windows (a passing scenario
 *   needs only its convergence evidence).
 * @return {Promise<Object>}
 */
async function collectScenarioLogArtifacts(
  scenarioDir,
  relevantNodeIds,
  workspaceRoot,
  entry,
  {
    retainLogWindows = true,
    maxRetainedBytes = LOG_WINDOW_COVERAGE.MAX_RETAINED_BYTES,
  } = {},
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
    logWindowCoverageByNodeId: {},
    logWindowCoverage: null,
    decisionArtifactsByNodeId: {},
  };
  let entries = [];
  try {
    entries = await readdir(scenarioDir, {withFileTypes: true});
  } catch (_error) {
    // No scenario dir: no event stream and no curated logs. The full logs
    // live outside it, so the nodes the entry names still get windows.
    if (retainLogWindows) {
      await retainRunLogWindows(result, {scenarioDir, workspaceRoot, entry,
        nodeIds: relevantNodeIds, playbackInsights: null, maxRetainedBytes});
    }
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

  if (retainLogWindows) {
    await retainRunLogWindows(result, {scenarioDir, workspaceRoot, entry,
      nodeIds: preferredNodeIds, playbackInsights, maxRetainedBytes});
  }
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
        const decisionArtifacts =
          extractDecisionArtifactsFromLogContent(content);
        if (decisionArtifacts) {
          result.decisionArtifactsByNodeId[nodeId] = decisionArtifacts;
        }
      } catch (_error) {
        // The curated log is a sample used for paths and decision artifacts
        // only; its absence is recorded by the full-log coverage above.
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
