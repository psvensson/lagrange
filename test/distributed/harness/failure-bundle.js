import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';

const FAILURE_BUNDLE_SCHEMA_VERSION = 1;
const FAILURE_BUNDLE_RUN_DIRNAME = 'failure-bundles';
const FAILURE_BUNDLE_JSON_FILENAME = 'failure-bundle.json';
const FAILURE_BUNDLE_MARKDOWN_FILENAME = 'failure-bundle.md';
const RUN_FAILURE_BUNDLE_JSON_FILENAME = 'run-failure-bundle.json';
const RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME = 'run-failure-bundle.md';
const LOG_FILE_EXTENSION = '.log';
const TIMELINE_FILENAME = '_timeline.log';
const ANALYSIS_FILENAME = '_analysis.json';
const UTF8_ENCODING = 'utf8';
const ZERO = 0;
const LOG_TAIL_LINE_COUNT = 20;
const MARKDOWN_SECTION_BREAK = '\n\n';
const UNKNOWN_VALUE = 'unknown';
const NO_PROGRESS_REASON_CODE = 'stalled_no_progress';
const NODE_DIAGNOSTICS_TRACE_LIMIT = 5;
const NODE_ID_ERROR_PATTERN = /\bnode=([a-z0-9._:-]+)\b/gi;
const PLAYBACK_EVENTS_FILENAME = 'events.ndjson';
const PLAYBACK_EVENT_TYPE_CLUSTER_STAGE = 'cluster.stage';
const PLAYBACK_EVENT_TYPE_LOAD_STARTED = 'load.started';
const PLAYBACK_EVENT_TYPE_LOAD_PROGRESS = 'load.progress';
const PLAYBACK_EVENT_TYPE_LOAD_COMPLETED = 'load.completed';
const ROOT_CAUSE_CLASS_UNKNOWN = 'unknown';
const ROOT_CAUSE_CLASS_STARTUP = 'startup';
const ROOT_CAUSE_CLASS_DISCOVERY = 'discovery';
const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
const ROOT_CAUSE_CLASS_LOAD = 'load';
const ROOT_CAUSE_CLASS_CDC = 'cdc';
const ROOT_CAUSE_CLASS_CACHE = 'cache';
const FIRST_FAULT_MARKER_QUEUE_PRESSURE = 'queuePressureOnset';
const FIRST_FAULT_MARKER_ATTEMPT_ERRORS = 'attemptErrorOnset';
const FIRST_FAULT_MARKER_HARD_FAILURE = 'hardFailureOnset';
const LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE = 'nodeSlotUnavailable';
const LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED = 'nodeAdmissionBlocked';
const LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE =
  'retryableControlPlanePressure';
const LOAD_WAIT_REASON_TIMEOUT_WAITS = 'timeoutWaits';
const LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED = 'queueCapacityRejected';
const READINESS_REASON_MAX_NODES = 25;
const READINESS_REASON_MAX_PER_NODE = 5;
const AFFECTED_NODE_ID_LIMIT = 25;

const LOAD_WAIT_REASON_KEYS = Object.freeze([
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED,
  LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
  LOAD_WAIT_REASON_TIMEOUT_WAITS,
  LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED,
]);

const LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON = Object.freeze({
  [LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE]: ROOT_CAUSE_CLASS_LOAD,
  [LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED]: ROOT_CAUSE_CLASS_LOAD,
  [LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE]:
    ROOT_CAUSE_CLASS_DISCOVERY,
  [LOAD_WAIT_REASON_TIMEOUT_WAITS]: ROOT_CAUSE_CLASS_LOAD,
  [LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED]: ROOT_CAUSE_CLASS_LOAD,
});

function toWorkspaceRelative(targetPath, workspaceRoot = process.cwd()) {
  if (typeof targetPath !== 'string' || targetPath.length === ZERO) {
    return null;
  }
  return relative(workspaceRoot, resolve(targetPath));
}

function sanitizePathSegment(value, fallback = UNKNOWN_VALUE) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > ZERO ? normalized : fallback;
}

function sliceLogTail(logContent, maxLines = LOG_TAIL_LINE_COUNT) {
  const lines = String(logContent || '')
    .split('\n')
    .filter((line) => line.length > ZERO);
  return lines.slice(-Math.max(1, maxLines));
}

function parseStructuredLogLine(line) {
  const jsonStart = String(line || '').indexOf('{');
  if (jsonStart < ZERO) {
    return null;
  }
  try {
    const parsed = JSON.parse(String(line).slice(jsonStart));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function resolveRoutingDiagnostics(logExcerpt) {
  for (const line of [...(Array.isArray(logExcerpt) ? logExcerpt : [])].reverse()) {
    const parsed = parseStructuredLogLine(line);
    if (!parsed ||
        parsed.subsystem !== 'query-executor' ||
        !parsed.routingSnapshot ||
        typeof parsed.routingSnapshot !== 'object') {
      continue;
    }
    return parsed.routingSnapshot;
  }
  return null;
}

function resolveFailureDiagnostics(entry) {
  const diagnostics = entry?.details?.diagnostics;
  return diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNonNegativeCount(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return Math.max(ZERO, Math.floor(numericValue));
}

function resolveCanonicalFailedOperationCount(metrics) {
  const failedCount = normalizeNonNegativeCount(metrics?.failed);
  const errorCount = normalizeNonNegativeCount(metrics?.errors);
  if (failedCount !== null && errorCount !== null) {
    return Math.max(failedCount, errorCount);
  }
  if (failedCount !== null) {
    return failedCount;
  }
  if (errorCount !== null) {
    return errorCount;
  }
  return ZERO;
}

function resolveFailureReasonCounts(entry, fallbackReasonCounts = null) {
  const reasonCounts = resolveFailureDiagnostics(entry)?.failure?.reasonCounts;
  if (reasonCounts && typeof reasonCounts === 'object') {
    return reasonCounts;
  }
  if (fallbackReasonCounts && typeof fallbackReasonCounts === 'object') {
    return fallbackReasonCounts;
  }
  return {};
}

function buildTopReasonCounts(reasonCounts, limit = 5) {
  return Object.entries(reasonCounts)
    .map(([reason, count]) => ({
      reason: String(reason),
      count: Number(count || ZERO),
    }))
    .filter((entry) => Number.isFinite(entry.count) && entry.count > ZERO)
    .sort((left, right) => right.count - left.count)
    .slice(ZERO, limit);
}

function buildDominantReason(reasonCounts) {
  const topReasons = buildTopReasonCounts(reasonCounts, 1);
  return topReasons.length > ZERO ? topReasons[ZERO].reason : null;
}

function mergeReasonCounts(...entries) {
  const merged = {};
  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }
    for (const [reason, count] of Object.entries(entry)) {
      const normalizedCount = normalizeNonNegativeCount(count);
      if (normalizedCount === null || normalizedCount <= ZERO) {
        continue;
      }
      if (!Object.hasOwn(merged, reason)) {
        merged[reason] = ZERO;
      }
      merged[reason] += normalizedCount;
    }
  }
  return merged;
}

function deriveReasonCountsFromLoadMetrics(loadMetrics) {
  if (!isRecord(loadMetrics)) {
    return {};
  }
  const waitReasons = isRecord(loadMetrics.waitReasons) ?
    loadMetrics.waitReasons :
    {};
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
      const normalizedReason = String(reason || '').trim();
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
  const normalizedReason = String(reason || '').trim();
  if (normalizedReason.length === ZERO) {
    return null;
  }
  if (Object.hasOwn(LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON, normalizedReason)) {
    return LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON[normalizedReason];
  }
  if (normalizedReason === 'hardLoadFailures') {
    return ROOT_CAUSE_CLASS_LOAD;
  }

  const lowered = normalizedReason.toLowerCase();
  if (lowered.includes('cdc')) {
    return ROOT_CAUSE_CLASS_CDC;
  }
  if (lowered.includes('cache')) {
    return ROOT_CAUSE_CLASS_CACHE;
  }
  if (lowered.includes('query_transport') ||
      lowered.includes('readiness') ||
      lowered.includes('bootstrap') ||
      lowered.includes('join_ready') ||
      lowered.includes('metadata_publication')) {
    return ROOT_CAUSE_CLASS_STARTUP;
  }
  if (lowered.includes('topology') ||
      lowered.includes('leader') ||
      lowered.includes('partition') ||
      lowered.includes('replica')) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  if (lowered.includes('routing') ||
      lowered.includes('discovery') ||
      lowered.includes('service') ||
      lowered.includes('schema')) {
    return ROOT_CAUSE_CLASS_DISCOVERY;
  }
  if (lowered.includes('load') ||
      lowered.includes('queue') ||
      lowered.includes('dispatch') ||
      lowered.includes('timeout') ||
      lowered.includes('admission') ||
      lowered.includes('failed')) {
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
  if (typeof rootCauseClass === 'string' && rootCauseClass.length > ZERO) {
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
  const orderedMarkers = Array.isArray(firstFaultTimeline?.orderedMarkers) ?
    firstFaultTimeline.orderedMarkers :
    [];
  const earliestMarker = orderedMarkers.length > ZERO ?
    orderedMarkers[ZERO].marker :
    null;
  if (earliestMarker === FIRST_FAULT_MARKER_QUEUE_PRESSURE ||
      earliestMarker === FIRST_FAULT_MARKER_ATTEMPT_ERRORS ||
      earliestMarker === FIRST_FAULT_MARKER_HARD_FAILURE) {
    return ROOT_CAUSE_CLASS_LOAD;
  }
  if (isRecord(readiness?.nodeReasonsByNodeId) &&
      Object.keys(readiness.nodeReasonsByNodeId).length > ZERO) {
    return ROOT_CAUSE_CLASS_STARTUP;
  }
  if (Array.isArray(controlPlane?.timeoutClassifications) &&
      controlPlane.timeoutClassifications.length > ZERO) {
    return ROOT_CAUSE_CLASS_TOPOLOGY;
  }
  return ROOT_CAUSE_CLASS_UNKNOWN;
}

function normalizeAffectedNodeIds(entry, fallbackNodeIds = []) {
  const explicitNodeIds = Array.isArray(
    resolveFailureDiagnostics(entry)?.failure?.affectedNodeIds,
  ) ?
    resolveFailureDiagnostics(entry).failure.affectedNodeIds :
    [];
  const sourceNodeIds = explicitNodeIds.length > ZERO ?
    explicitNodeIds :
    fallbackNodeIds;
  return sourceNodeIds
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > ZERO)
    .slice(ZERO, AFFECTED_NODE_ID_LIMIT);
}

function buildMarker(timestampMs, loadStartAtMs) {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return {
    atMs: timestampMs,
    at: toIsoTimestamp(timestampMs),
    deltaFromLoadStartMs:
      Number.isFinite(loadStartAtMs) ?
        Math.max(ZERO, Math.floor(timestampMs - loadStartAtMs)) :
        null,
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
  const waitReasons = isRecord(loadMetrics.waitReasons) ?
    loadMetrics.waitReasons :
    {};
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
    .sort((left, right) =>
      Number(left.timestamp || ZERO) - Number(right.timestamp || ZERO),
    );
  const loadStart = sortedEvents.find((event) =>
    event.type === PLAYBACK_EVENT_TYPE_LOAD_STARTED,
  );
  const loadStartAtMs = normalizeNonNegativeCount(loadStart?.timestamp);
  if (loadStartAtMs === null) {
    return null;
  }
  let queuePressureOnsetAtMs = null;
  let attemptErrorOnsetAtMs = null;
  let hardFailureOnsetAtMs = null;

  for (const event of sortedEvents) {
    if (event.type !== PLAYBACK_EVENT_TYPE_LOAD_PROGRESS &&
        event.type !== PLAYBACK_EVENT_TYPE_LOAD_COMPLETED) {
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
    if (queuePressureOnsetAtMs === null &&
        resolveLoadQueuePressureSignalCount(metrics) > ZERO) {
      queuePressureOnsetAtMs = timestampMs;
    }
    if (attemptErrorOnsetAtMs === null &&
        (normalizeNonNegativeCount(metrics.attemptErrors) || ZERO) > ZERO) {
      attemptErrorOnsetAtMs = timestampMs;
    }
    if (hardFailureOnsetAtMs === null &&
        resolveCanonicalFailedOperationCount(metrics) > ZERO) {
      hardFailureOnsetAtMs = timestampMs;
    }
  }

  const markers = {
    [FIRST_FAULT_MARKER_QUEUE_PRESSURE]:
      buildMarker(queuePressureOnsetAtMs, loadStartAtMs),
    [FIRST_FAULT_MARKER_ATTEMPT_ERRORS]:
      buildMarker(attemptErrorOnsetAtMs, loadStartAtMs),
    [FIRST_FAULT_MARKER_HARD_FAILURE]:
      buildMarker(hardFailureOnsetAtMs, loadStartAtMs),
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

function buildReadinessFromPlaybackEvents(events) {
  const sortedEvents = [...(Array.isArray(events) ? events : [])]
    .filter((event) => isRecord(event))
    .sort((left, right) =>
      Number(left.timestamp || ZERO) - Number(right.timestamp || ZERO),
    );
  const nodeReasonsByNodeId = {};
  let lastReadinessTimelineEntry = null;

  for (const event of sortedEvents) {
    if (event.type !== PLAYBACK_EVENT_TYPE_CLUSTER_STAGE) {
      continue;
    }
    const nodeDiagnostics = Array.isArray(event?.details?.nodeDiagnostics) ?
      event.details.nodeDiagnostics :
      [];
    if (nodeDiagnostics.length === ZERO) {
      continue;
    }
    const nodeReasonCountsByNodeId = {};
    for (const nodeDiagnostic of nodeDiagnostics) {
      const nodeId = String(nodeDiagnostic?.nodeId || '').trim();
      if (nodeId.length === ZERO) {
        continue;
      }
      const reasons = Array.isArray(nodeDiagnostic?.reasons) ?
        nodeDiagnostic.reasons
          .map((reason) => String(reason || '').trim())
          .filter((reason) => reason.length > ZERO) :
        [];
      nodeReasonCountsByNodeId[nodeId] = reasons.length;
      if (reasons.length === ZERO) {
        continue;
      }
      if (!Object.hasOwn(nodeReasonsByNodeId, nodeId)) {
        if (Object.keys(nodeReasonsByNodeId).length >= READINESS_REASON_MAX_NODES) {
          continue;
        }
        nodeReasonsByNodeId[nodeId] = [];
      }
      for (const reason of reasons) {
        if (nodeReasonsByNodeId[nodeId].includes(reason)) {
          continue;
        }
        nodeReasonsByNodeId[nodeId].push(reason);
        if (nodeReasonsByNodeId[nodeId].length >= READINESS_REASON_MAX_PER_NODE) {
          break;
        }
      }
    }
    lastReadinessTimelineEntry = {
      timestampMs: normalizeNonNegativeCount(event?.timestamp),
      timestamp: toIsoTimestamp(normalizeNonNegativeCount(event?.timestamp)),
      stage: String(event?.details?.stage || ''),
      nodeReasonCountsByNodeId,
    };
  }

  if (Object.keys(nodeReasonsByNodeId).length === ZERO &&
      !lastReadinessTimelineEntry) {
    return null;
  }
  return {
    nodeReasonsByNodeId:
      Object.keys(nodeReasonsByNodeId).length > ZERO ?
        nodeReasonsByNodeId :
        null,
    lastReadinessTimelineEntry,
  };
}

async function collectPlaybackEventInsights(scenarioDir, workspaceRoot) {
  const playbackEventsAbsolutePath = join(scenarioDir, PLAYBACK_EVENTS_FILENAME);
  try {
    const content = await readFile(playbackEventsAbsolutePath, UTF8_ENCODING);
    const events = String(content || '')
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
      .filter((event) => event !== null);
    if (events.length === ZERO) {
      return null;
    }
    return {
      playbackEventsPath: toWorkspaceRelative(
        playbackEventsAbsolutePath,
        workspaceRoot,
      ),
      firstFaultTimeline: buildFirstFaultTimelineFromPlaybackEvents(events),
      readiness: buildReadinessFromPlaybackEvents(events),
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
    (Array.isArray(failedArtifacts?.gateResult?.readinessTimeline) ?
      failedArtifacts.gateResult.readinessTimeline :
      []);
  const artifactNodeReasonsByNodeId = isRecord(failedArtifacts.nodeReasonsByNodeId) ?
    failedArtifacts.nodeReasonsByNodeId :
    null;
  const failureNodeReasonsByNodeId = isRecord(diagnostics?.failure?.nodeReasonsByNodeId) ?
    diagnostics.failure.nodeReasonsByNodeId :
    null;
  const playbackNodeReasonsByNodeId = isRecord(playbackReadiness?.nodeReasonsByNodeId) ?
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
        readinessTimeline[readinessTimeline.length - 1] :
        (playbackReadiness?.lastReadinessTimelineEntry || null),
  };
}

function resolveControlPlaneDiagnostics(entry) {
  const snapshotsByNodeId = resolveControlSnapshot(entry);
  const directDiagnostics =
    entry?.details?.diagnostics?.controlPlaneDiagnostics &&
    typeof entry.details.diagnostics.controlPlaneDiagnostics === 'object' &&
    !Array.isArray(entry.details.diagnostics.controlPlaneDiagnostics) ?
      entry.details.diagnostics.controlPlaneDiagnostics :
      null;
  const publicationModeByNodeId = {};
  const heartbeatPublicationByNodeId = {};
  const readinessByNodeId = {};
  const nodeLivenessByNodeId = {};
  const readinessTransitionsByNodeId = {};
  const placementEligibilityByNodeId = {};
  const workflowAdmissionsByWorkflowId = {};
  const timeoutClassifications = [];

  if (snapshotsByNodeId && typeof snapshotsByNodeId === 'object') {
    for (const [snapshotNodeId, snapshot] of Object.entries(snapshotsByNodeId)) {
      const diagnostics = snapshot?.controlPlaneDiagnostics;
      if (!diagnostics || typeof diagnostics !== 'object') {
        continue;
      }

      if (diagnostics.publicationMode &&
          typeof diagnostics.publicationMode === 'object') {
        publicationModeByNodeId[snapshotNodeId] =
          diagnostics.publicationMode;
      }
      if (diagnostics.heartbeatPublication &&
          typeof diagnostics.heartbeatPublication === 'object') {
        heartbeatPublicationByNodeId[snapshotNodeId] =
          diagnostics.heartbeatPublication;
      }

      const readiness = diagnostics.readinessByNodeId &&
        typeof diagnostics.readinessByNodeId === 'object' ?
        diagnostics.readinessByNodeId :
        {};
      Object.assign(readinessByNodeId, readiness);

      const nodeLiveness = diagnostics.nodeLivenessByNodeId &&
        typeof diagnostics.nodeLivenessByNodeId === 'object' ?
        diagnostics.nodeLivenessByNodeId :
        {};
      Object.assign(nodeLivenessByNodeId, nodeLiveness);

      const readinessTransitions = diagnostics.readinessTransitionsByNodeId &&
        typeof diagnostics.readinessTransitionsByNodeId === 'object' ?
        diagnostics.readinessTransitionsByNodeId :
        {};
      for (const [nodeId, transitions] of Object.entries(readinessTransitions)) {
        const existing =
          readinessTransitionsByNodeId[nodeId] || [];
        readinessTransitionsByNodeId[nodeId] =
          mergeTransitionHistory(existing, transitions);
      }

      const placement = diagnostics.placementEligibilityByNodeId &&
        typeof diagnostics.placementEligibilityByNodeId === 'object' ?
        diagnostics.placementEligibilityByNodeId :
        {};
      Object.assign(placementEligibilityByNodeId, placement);

      const workflows = diagnostics.workflowAdmissionsByWorkflowId &&
        typeof diagnostics.workflowAdmissionsByWorkflowId === 'object' ?
        diagnostics.workflowAdmissionsByWorkflowId :
        {};
      Object.assign(workflowAdmissionsByWorkflowId, workflows);

      const timeouts = Array.isArray(diagnostics.timeoutClassifications) ?
        diagnostics.timeoutClassifications :
        [];
      for (const timeout of timeouts) {
        if (!timeout || typeof timeout !== 'object') {
          continue;
        }
        timeoutClassifications.push({
          snapshotNodeId,
          ...timeout,
        });
      }
    }
  }

  if (Object.keys(publicationModeByNodeId).length === ZERO &&
      Object.keys(heartbeatPublicationByNodeId).length === ZERO &&
      Object.keys(readinessByNodeId).length === ZERO &&
      Object.keys(nodeLivenessByNodeId).length === ZERO &&
      Object.keys(readinessTransitionsByNodeId).length === ZERO &&
      Object.keys(placementEligibilityByNodeId).length === ZERO &&
      Object.keys(workflowAdmissionsByWorkflowId).length === ZERO &&
      timeoutClassifications.length === ZERO &&
      directDiagnostics === null) {
    return null;
  }

  return {
    publicationModeByNodeId,
    heartbeatPublicationByNodeId,
    readinessByNodeId,
    nodeLivenessByNodeId,
    readinessTransitionsByNodeId,
    placementEligibilityByNodeId,
    workflowAdmissionsByWorkflowId,
    timeoutClassifications,
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
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const signature = JSON.stringify({
      nodeId: entry.nodeId || null,
      observedAtMs: Number(entry.observedAtMs || ZERO),
      serveEligible: entry.serveEligible === true,
      repairEligible: entry.repairEligible === true,
      reasonCodes: Array.isArray(entry.reasonCodes) ?
        entry.reasonCodes :
        [],
    });
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    merged.push(entry);
  }
  merged.sort((left, right) =>
    Number(left?.observedAtMs || ZERO) - Number(right?.observedAtMs || ZERO),
  );
  return merged;
}

function resolveControlSnapshot(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const snapshotsByNodeId = diagnostics?.rootCauseBundle?.snapshotsByNodeId;
  if (snapshotsByNodeId && typeof snapshotsByNodeId === 'object') {
    return snapshotsByNodeId;
  }
  return null;
}

function resolveAdminQueryTraceByNodeId(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const traceByNodeId = diagnostics?.rootCauseBundle?.adminQueryTraceByNodeId;
  if (traceByNodeId && typeof traceByNodeId === 'object') {
    return traceByNodeId;
  }
  return null;
}

function resolveLoadMetrics(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  if (diagnostics?.loadMetrics &&
      typeof diagnostics.loadMetrics === 'object' &&
      !Array.isArray(diagnostics.loadMetrics)) {
    return diagnostics.loadMetrics;
  }
  if (entry?.loadMetrics &&
      typeof entry.loadMetrics === 'object' &&
      !Array.isArray(entry.loadMetrics)) {
    return entry.loadMetrics;
  }
  return null;
}

function extractNodeIdsFromText(value) {
  const nodeIds = [];
  const matches = String(value || '').matchAll(NODE_ID_ERROR_PATTERN);
  for (const match of matches) {
    const nodeId = String(match?.[1] || '');
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
  for (const snapshotNodeId of Object.keys(resolveControlSnapshot(entry) || {})) {
    nodeIds.add(snapshotNodeId);
  }
  for (const traceNodeId of Object.keys(resolveAdminQueryTraceByNodeId(entry) || {})) {
    nodeIds.add(traceNodeId);
  }
  const perNodeMetrics = loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' &&
    !Array.isArray(loadMetrics.perNode) ?
    loadMetrics.perNode :
    {};
  for (const [nodeId, nodeMetrics] of Object.entries(perNodeMetrics)) {
    const attemptedErrors = Number(nodeMetrics?.attemptErrors || ZERO);
    const dispatched = Number(nodeMetrics?.dispatched || ZERO);
    const success = Number(nodeMetrics?.success || ZERO);
    const rejected = Number(nodeMetrics?.rejected || ZERO);
    if (attemptedErrors > ZERO ||
        dispatched > success ||
        rejected > ZERO) {
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
  const transitionState = String(workflow?.transitionState || '').toLowerCase();
  if (transitionState !== 'blocked' && transitionState !== 'deferred') {
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
    .filter((traceEntry) =>
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
  readinessTransitions.sort((left, right) =>
    Number(left?.observedAtMs || ZERO) - Number(right?.observedAtMs || ZERO),
  );
  const firstReadinessFlip = readinessTransitions[ZERO] || null;

  const relatedWorkflows = Object.values(
    controlPlaneDiagnostics?.workflowAdmissionsByWorkflowId || {},
  ).filter((workflow) => resolveWorkflowRelevantNodeIds(workflow).includes(nodeId));
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

  if (!firstLoadFailure &&
      !firstReadinessFlip &&
      splitStartTimestamps.length === ZERO &&
      splitDeniedTimestamps.length === ZERO &&
      splitFailureTimestamps.length === ZERO) {
    return null;
  }

  const heartbeatAgeMsAtFirstReadinessFlip =
    Number(firstReadinessFlip?.rawInputs?.heartbeatAgeMs);
  const readyLeaseLagMsAtFirstReadinessFlip =
    Number(firstReadinessFlip?.rawInputs?.readyLeaseLagMs);
  return {
    firstLoadFailureAtMs: firstLoadFailure?.timestampMs || null,
    firstLoadFailureAt:
      toIsoTimestamp(firstLoadFailure?.timestampMs || null),
    firstLoadFailureQueryId:
      firstLoadFailure?.traceEntry?.queryId || null,
    firstReadinessFlipAtMs:
      Number(firstReadinessFlip?.observedAtMs || ZERO) || null,
    firstReadinessFlipAt:
      firstReadinessFlip?.observedAt || null,
    heartbeatAgeMsAtFirstReadinessFlip:
      Number.isFinite(heartbeatAgeMsAtFirstReadinessFlip) ?
        heartbeatAgeMsAtFirstReadinessFlip :
        null,
    readyLeaseLagMsAtFirstReadinessFlip:
      Number.isFinite(readyLeaseLagMsAtFirstReadinessFlip) ?
        readyLeaseLagMsAtFirstReadinessFlip :
        null,
    firstSplitStartedAtMs:
      splitStartTimestamps.length > ZERO ?
        splitStartTimestamps[ZERO] :
        null,
    firstSplitStartedAt:
      splitStartTimestamps.length > ZERO ?
        toIsoTimestamp(splitStartTimestamps[ZERO]) :
        null,
    firstSplitRejectedAtMs:
      splitDeniedTimestamps.length > ZERO ?
        splitDeniedTimestamps[ZERO] :
        null,
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

function buildTimelineCorrelationByNodeId(entry, controlPlaneDiagnostics = null) {
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

async function collectScenarioLogArtifacts(scenarioDir, relevantNodeIds, workspaceRoot) {
  const result = {
    scenarioDirPath: toWorkspaceRelative(scenarioDir, workspaceRoot),
    timelinePath: null,
    analysisPath: null,
    playbackEventsPath: null,
    firstFaultTimeline: null,
    playbackReadiness: null,
    nodeLogPaths: {},
    excerptsByNodeId: {},
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

  const preferredNodeIds = relevantNodeIds.length > ZERO ?
    relevantNodeIds :
    nodeLogCandidates.map((entryName) =>
      entryName.slice(ZERO, -LOG_FILE_EXTENSION.length),
    );

  await Promise.all(preferredNodeIds.map(async (nodeId) => {
    const filename = sanitizePathSegment(nodeId) + LOG_FILE_EXTENSION;
    const absolutePath = join(scenarioDir, filename);
    try {
      const content = await readFile(absolutePath, UTF8_ENCODING);
      result.nodeLogPaths[nodeId] = toWorkspaceRelative(absolutePath, workspaceRoot);
      result.excerptsByNodeId[nodeId] = sliceLogTail(content);
    } catch (_error) {
      // Best effort: missing per-node logs are allowed.
    }
  }));

  const playbackInsights = await collectPlaybackEventInsights(
    scenarioDir,
    workspaceRoot,
  );
  if (playbackInsights) {
    result.playbackEventsPath = playbackInsights.playbackEventsPath;
    result.firstFaultTimeline = playbackInsights.firstFaultTimeline || null;
    result.playbackReadiness = playbackInsights.readiness || null;
  }

  return result;
}

function buildFocusedNodeDiagnostics(
  entry,
  logs,
  controlPlaneDiagnostics = null,
  timelineCorrelationByNodeId = null,
) {
  const relevantNodeIds = resolveRelevantNodeIds(entry);
  const loadMetrics = resolveLoadMetrics(entry);
  const perNodeMetrics = loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' &&
    !Array.isArray(loadMetrics.perNode) ?
    loadMetrics.perNode :
    {};
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  const failedPhaseErrors = Array.isArray(resolveFailureDiagnostics(entry)?.failedPhase?.errors) ?
    resolveFailureDiagnostics(entry).failedPhase.errors :
    [];
  const errorTexts = [...failedPhaseErrors, ...distinctErrors];
  const controlSnapshotByNodeId = resolveControlSnapshot(entry) || {};
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
    const timelineCorrelation =
      timelineCorrelationByNodeId?.[nodeId] || null;
    const nodeLogPath = logs?.nodeLogPaths?.[nodeId] || null;
    const logExcerpt = Array.isArray(logs?.excerptsByNodeId?.[nodeId]) ?
      logs.excerptsByNodeId[nodeId] :
      [];
    const routingDiagnostics = resolveRoutingDiagnostics(logExcerpt);
    if (!perNodeMetrics[nodeId] &&
        matchingErrors.length === ZERO &&
        !controlSnapshotByNodeId[nodeId] &&
        traceEntries.length === ZERO &&
        !readiness &&
        !nodeLiveness &&
        !placementEligibility &&
        !publicationMode &&
        !heartbeatPublication &&
        readinessTransitions.length === ZERO &&
        !timelineCorrelation &&
        !routingDiagnostics &&
        !nodeLogPath &&
        logExcerpt.length === ZERO) {
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
      timelineCorrelation,
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
    return 'attemptErrors';
  }
  if (marker === FIRST_FAULT_MARKER_HARD_FAILURE) {
    return 'hardLoadFailures';
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

function buildFailureArtifact({
  entry,
  readiness,
  controlPlane,
  firstFaultTimeline,
}) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const hasExistingFailure = isRecord(diagnostics.failure);
  const existingFailure = hasExistingFailure ?
    diagnostics.failure :
    {};
  const loadMetrics = resolveLoadMetrics(entry);
  const loadReasonCounts = deriveReasonCountsFromLoadMetrics(loadMetrics);
  const readinessReasonCounts = deriveReasonCountsFromReadiness(
    readiness?.nodeReasonsByNodeId,
  );
  const reasonCounts = mergeReasonCounts(
    isRecord(existingFailure.reasonCounts) ? existingFailure.reasonCounts : null,
    loadReasonCounts,
    readinessReasonCounts,
  );
  const timelineDominantReason = resolveDominantReasonFromFirstFaultTimeline(
    firstFaultTimeline,
  );
  const dominantReason = typeof existingFailure.dominantReason === 'string' &&
    existingFailure.dominantReason.length > ZERO ?
    existingFailure.dominantReason :
    (buildDominantReason(reasonCounts) || timelineDominantReason || null);
  if (dominantReason && !Object.hasOwn(reasonCounts, dominantReason)) {
    reasonCounts[dominantReason] = 1;
  }
  const rootCauseClass = resolveRootCauseClass({
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

  if (!hasExistingFailure &&
      Object.keys(reasonCounts).length === ZERO &&
      !dominantReason &&
      affectedNodeIds.length === ZERO &&
      rootCauseClass === ROOT_CAUSE_CLASS_UNKNOWN) {
    return null;
  }

  return {
    ...existingFailure,
    rootCauseClass,
    dominantReason,
    reasonCounts,
    affectedNodeIds,
  };
}

function buildScenarioFailureBundle({
  entry,
  reportOutputPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  logs,
}) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const noProgress = diagnostics.noProgress || null;
  const controlPlane = resolveControlPlaneDiagnostics(entry);
  const readiness = resolveReadinessSnapshot(
    entry,
    logs?.playbackReadiness || null,
  );
  const firstFaultTimeline = resolveFirstFaultTimeline(
    entry,
    logs?.firstFaultTimeline || null,
  );
  const failure = buildFailureArtifact({
    entry,
    readiness,
    controlPlane,
    firstFaultTimeline,
  });
  const failureReasonCounts = resolveFailureReasonCounts(
    entry,
    failure?.reasonCounts || null,
  );
  const timelineCorrelationByNodeId = buildTimelineCorrelationByNodeId(
    entry,
    controlPlane,
  );
  const nodeDiagnostics = buildFocusedNodeDiagnostics(
    entry,
    logs,
    controlPlane,
    timelineCorrelationByNodeId,
  );
  return {
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    reportPath: reportOutputPath,
    scenario: entry.scenario,
    summary: {
      passed: entry.passed === true,
      error: entry.error || null,
      phase: diagnostics?.failedPhase?.phase || null,
      rootCauseClass: failure?.rootCauseClass || null,
      dominantReason: failure?.dominantReason || null,
      bottleneckEstimate: entry?.bottleneckEstimate || null,
    },
    reportSummary,
    standardSummary,
    benchmarkRegressionGate: benchmarkRegressionGate || null,
    diagnostics: {
      failure,
      failedPhase: diagnostics.failedPhase || null,
      noProgress,
      invariantBreaches: diagnostics.invariantBreaches || entry.invariantBreaches || null,
      controlPlaneDiagnostics: diagnostics.controlPlaneDiagnostics || null,
      rootCauseBundle: diagnostics.rootCauseBundle || null,
      firstFaultTimeline,
    },
    controlSnapshot: resolveControlSnapshot(entry),
    controlPlane,
    readiness,
    topFailures: {
      reasonCounts: failureReasonCounts,
      topReasons: buildTopReasonCounts(failureReasonCounts),
      affectedNodeIds: Array.isArray(failure?.affectedNodeIds) ?
        failure.affectedNodeIds :
        [],
      loadMetrics: entry.loadMetrics || null,
    },
    nodeDiagnostics,
    logs,
    playback: entry.playback || null,
    trace: entry.trace || null,
  };
}

function formatList(values) {
  const items = Array.isArray(values) ?
    values
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > ZERO) :
    [];
  return items.length > ZERO ? items.join(', ') : UNKNOWN_VALUE;
}

function formatReadinessDimensions(readiness) {
  const dimensions = readiness?.dimensions &&
    typeof readiness.dimensions === 'object' ?
    readiness.dimensions :
    {};
  const entries = Object.entries(dimensions)
    .map(([dimension, value]) =>
      `${dimension}=${value === true ? 'ready' : 'blocked'}`,
    );
  return entries.length > ZERO ? entries.join(', ') : UNKNOWN_VALUE;
}

function formatPublicationMode(publicationMode) {
  if (!publicationMode || typeof publicationMode !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'mode=' + String(publicationMode.currentMode || UNKNOWN_VALUE),
    'reason=' + String(publicationMode.reasonCode || UNKNOWN_VALUE),
  ].join(', ');
}

function formatHeartbeatPublication(publication) {
  if (!publication || typeof publication !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'path=' + String(publication.publicationPath || UNKNOWN_VALUE),
    'target=' + String(publication.targetAddress || UNKNOWN_VALUE),
    'service=' + String(publication.targetServiceId || UNKNOWN_VALUE),
    'lastAttemptAt=' + String(publication.lastAttemptAt || UNKNOWN_VALUE),
    'lastSuccessAt=' + String(publication.lastSuccessAt || UNKNOWN_VALUE),
    'consecutiveFailures=' + String(
      publication.consecutiveFailures ?? UNKNOWN_VALUE,
    ),
    'failure=' + String(publication.lastFailureReason || UNKNOWN_VALUE),
  ].join(', ');
}

function formatNodeLiveness(nodeLiveness) {
  if (!nodeLiveness || typeof nodeLiveness !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'lastHeartbeat=' + String(nodeLiveness.lastHeartbeat ?? UNKNOWN_VALUE),
    'heartbeatAgeMs=' + String(nodeLiveness.heartbeatAgeMs ?? UNKNOWN_VALUE),
    'readyLeaseExpiresAt=' +
      String(nodeLiveness.readyLeaseExpiresAt ?? UNKNOWN_VALUE),
    'readyLeaseLagMs=' + String(
      nodeLiveness.readyLeaseAgeMs ??
        nodeLiveness.readyLeaseLagMs ??
        UNKNOWN_VALUE,
    ),
  ].join(', ');
}

function formatTimelineCorrelation(correlation) {
  if (!correlation || typeof correlation !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'loadFailureAt=' + String(correlation.firstLoadFailureAt || UNKNOWN_VALUE),
    'readinessFlipAt=' + String(correlation.firstReadinessFlipAt || UNKNOWN_VALUE),
    'heartbeatAgeMsAtFlip=' + String(
      correlation.heartbeatAgeMsAtFirstReadinessFlip ?? UNKNOWN_VALUE,
    ),
    'splitStartAt=' + String(correlation.firstSplitStartedAt || UNKNOWN_VALUE),
    'splitRejectedAt=' + String(
      correlation.firstSplitRejectedAt || UNKNOWN_VALUE,
    ),
    'splitFailedAt=' + String(correlation.firstSplitFailedAt || UNKNOWN_VALUE),
  ].join(', ');
}

function formatReadinessTransition(transition) {
  if (!transition || typeof transition !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'at=' + String(transition.observedAt || UNKNOWN_VALUE),
    'serve=' + String(
      transition.previousServeEligible ?? UNKNOWN_VALUE,
    ) + '->' + String(transition.serveEligible ?? UNKNOWN_VALUE),
    'repair=' + String(
      transition.previousRepairEligible ?? UNKNOWN_VALUE,
    ) + '->' + String(transition.repairEligible ?? UNKNOWN_VALUE),
    'heartbeatAgeMs=' + String(
      transition?.rawInputs?.heartbeatAgeMs ?? UNKNOWN_VALUE,
    ),
    'readyLeaseLagMs=' + String(
      transition?.rawInputs?.readyLeaseLagMs ?? UNKNOWN_VALUE,
    ),
    'reasons=' + formatList(transition.reasonCodes),
  ].join(', ');
}

function formatWorkflowAdmission(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'state=' + String(workflow.transitionState || UNKNOWN_VALUE),
    'decision=' + String(
      workflow?.admission?.decisionType ||
      workflow?.admission?.decision ||
      UNKNOWN_VALUE,
    ),
    'blockingReasons=' + formatList(
      Array.isArray(workflow?.blockingReasons) ?
        workflow.blockingReasons.map((reason) => reason?.code || reason) :
        [],
    ),
  ].join(', ');
}

function formatTimeoutClassificationEntry(entry) {
  const timeoutClassification = entry?.timeoutClassification &&
    typeof entry.timeoutClassification === 'object' ?
    entry.timeoutClassification :
    {};
  return [
    'workflowId=' + String(entry?.workflowId || UNKNOWN_VALUE),
    'classification=' + String(
      timeoutClassification.classification || UNKNOWN_VALUE,
    ),
    'boundaryHit=' + String(timeoutClassification.boundaryHit === true),
    'nestedOperation=' + String(
      timeoutClassification.nestedOperation || UNKNOWN_VALUE,
    ),
  ].join(', ');
}

function formatNodeClientChannelMetrics(channel, metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return `- ${channel}: ` + UNKNOWN_VALUE;
  }
  return [
    '- ' + channel + ':',
    'requests=' + String(metrics.requests ?? ZERO),
    'successes=' + String(metrics.successes ?? ZERO),
    'errors=' + String(metrics.errors ?? ZERO),
    'timeouts=' + String(metrics.timeouts ?? ZERO),
    'retries=' + String(metrics.retries ?? ZERO),
    'breakerOpens=' + String(metrics.breakerOpens ?? ZERO),
    'budgetDenials=' + String(metrics.budgetDenials ?? ZERO),
    'timeoutBudgetMismatches=' + String(metrics.timeoutBudgetMismatches ?? ZERO),
    'timedOutInFlight=' + String(metrics.timedOutInFlight ?? ZERO),
  ].join(' ');
}

function formatNodeClientChannelState(channel, nodeId, state) {
  if (!state || typeof state !== 'object') {
    return `- ${channel}/${nodeId}: ` + UNKNOWN_VALUE;
  }
  return [
    '- ' + channel + '/' + nodeId + ':',
    'inFlight=' + String(state.inFlight ?? ZERO),
    'consecutiveFailures=' + String(state.consecutiveFailures ?? ZERO),
    'openUntilMs=' + String(state.openUntilMs ?? ZERO),
    'circuitOpen=' + String(state.circuitOpen === true),
  ].join(' ');
}

function formatNodeDiagnosticLoadMetrics(loadMetrics) {
  if (!loadMetrics || typeof loadMetrics !== 'object') {
    return null;
  }
  return [
    'dispatched=' + Number(loadMetrics.dispatched || ZERO),
    'success=' + Number(loadMetrics.success || ZERO),
    'attemptErrors=' + Number(loadMetrics.attemptErrors || ZERO),
    'admissionSignals=' + Number(loadMetrics.admissionSignals || ZERO),
    'queuePressureSignals=' + Number(loadMetrics.queuePressureSignals || ZERO),
    'rejected=' + Number(loadMetrics.rejected || ZERO),
  ].join(', ');
}

function formatRoutingDiagnostics(routingDiagnostics) {
  if (!routingDiagnostics || typeof routingDiagnostics !== 'object') {
    return UNKNOWN_VALUE;
  }
  const deniedByNodeId = routingDiagnostics.deniedByNodeId &&
    typeof routingDiagnostics.deniedByNodeId === 'object' ?
    Object.entries(routingDiagnostics.deniedByNodeId)
      .map(([nodeId, summary]) => {
        const reasonCodes = Array.isArray(summary?.reasonCodes) ?
          summary.reasonCodes :
          [];
        return `${nodeId}[${formatList(reasonCodes)}]`;
      }) :
    [];
  return [
    'reason=' + String(routingDiagnostics.reasonCode || UNKNOWN_VALUE),
    'decisionDimension=' + String(
      routingDiagnostics.routingReadinessDimension || UNKNOWN_VALUE,
    ),
    'services=' + String(routingDiagnostics.serviceRowCount ?? UNKNOWN_VALUE),
    'activeAddressed=' + String(
      routingDiagnostics.activeAddressedServiceCount ?? UNKNOWN_VALUE,
    ),
    'routable=' + String(
      routingDiagnostics.routableServiceCount ?? UNKNOWN_VALUE,
    ),
    'leaderKnown=' + String(routingDiagnostics.leaderKnown === true),
    'canonicalLeaderNodeId=' + String(
      routingDiagnostics.canonicalLeaderNodeId || UNKNOWN_VALUE,
    ),
    'deniedNodes=' + formatList(deniedByNodeId),
  ].join(', ');
}

function formatAdminQueryTraceEntry(entry) {
  return [
    'outcome=' + String(entry?.outcome || UNKNOWN_VALUE),
    'operation=' + String(entry?.operation || UNKNOWN_VALUE),
    'lane=' + String(entry?.lane || UNKNOWN_VALUE),
    'timeoutMs=' + String(entry?.timeoutMs ?? UNKNOWN_VALUE),
    'durationMs=' + String(entry?.durationMs ?? UNKNOWN_VALUE),
    'error=' + String(entry?.error || UNKNOWN_VALUE),
  ].join(', ');
}

function formatFirstFaultTimeline(firstFaultTimeline) {
  if (!firstFaultTimeline || typeof firstFaultTimeline !== 'object') {
    return '- none';
  }
  const lines = [
    '- Load Start: ' + String(firstFaultTimeline.loadStartAt || UNKNOWN_VALUE),
  ];
  const orderedMarkers = Array.isArray(firstFaultTimeline.orderedMarkers) ?
    firstFaultTimeline.orderedMarkers :
    [];
  if (orderedMarkers.length === ZERO) {
    lines.push('- Markers: none');
    return lines.join('\n');
  }
  lines.push('- Markers:');
  for (const marker of orderedMarkers) {
    lines.push(
      `  - ${marker.marker}: ${String(marker.at || UNKNOWN_VALUE)} ` +
      `(deltaMs=${String(marker.deltaFromLoadStartMs ?? UNKNOWN_VALUE)})`,
    );
  }
  return lines.join('\n');
}

function renderScenarioFailureBundleMarkdown(bundle) {
  const topReasons = Array.isArray(bundle?.topFailures?.topReasons) ?
    bundle.topFailures.topReasons :
    [];
  const relevantLogs = bundle?.logs?.nodeLogPaths &&
    typeof bundle.logs.nodeLogPaths === 'object' ?
    Object.entries(bundle.logs.nodeLogPaths) :
    [];
  const sections = [
    '# Failure Bundle',
    [
      `- Scenario: ${bundle.scenario}`,
      `- Phase: ${bundle.summary.phase || UNKNOWN_VALUE}`,
      `- Root Cause Class: ${bundle.summary.rootCauseClass || UNKNOWN_VALUE}`,
      `- Dominant Reason: ${bundle.summary.dominantReason || UNKNOWN_VALUE}`,
      `- Bottleneck: ${bundle.summary.bottleneckEstimate?.kind || UNKNOWN_VALUE}`,
      `- Report: ${bundle.reportPath || UNKNOWN_VALUE}`,
    ].join('\n'),
  ];

  sections.push(
    '## Top Reasons\n' +
    (topReasons.length > ZERO ?
      topReasons.map((entry) => `- ${entry.reason}: ${entry.count}`).join('\n') :
      '- none'),
  );

  if (bundle?.diagnostics?.noProgress) {
    sections.push(
      '## No Progress\n' +
      [
        '- Reason Code: ' +
          String(
            bundle.diagnostics.noProgress.reasonCode ||
            NO_PROGRESS_REASON_CODE,
          ),
        '- Stalled Reason: ' +
          String(
            bundle.diagnostics.noProgress.stalledReason || UNKNOWN_VALUE,
          ),
        '- Last Progress: ' +
          String(
            bundle.diagnostics.noProgress.lastProgressEvent?.message ||
            UNKNOWN_VALUE,
          ),
        '- Last Meaningful Change: ' +
          String(
            bundle.diagnostics.noProgress.lastMeaningfulChange?.message ||
            UNKNOWN_VALUE,
          ),
      ].join('\n'),
    );
  }

  sections.push(
    '## Log Paths\n' +
    (relevantLogs.length > ZERO ?
      relevantLogs.map(([nodeId, path]) => `- ${nodeId}: ${path}`).join('\n') :
      '- none'),
  );
  if (bundle?.logs?.playbackEventsPath) {
    sections.push(
      '## Playback Events\n' +
      '- ' + String(bundle.logs.playbackEventsPath),
    );
  }

  if (bundle?.diagnostics?.firstFaultTimeline) {
    sections.push(
      '## First-Fault Timeline\n' +
      formatFirstFaultTimeline(bundle.diagnostics.firstFaultTimeline),
    );
  }

  const excerpts = bundle?.logs?.excerptsByNodeId &&
    typeof bundle.logs.excerptsByNodeId === 'object' ?
    Object.entries(bundle.logs.excerptsByNodeId) :
    [];
  if (excerpts.length > ZERO) {
    sections.push(
      '## Log Excerpts\n' +
      excerpts.map(([nodeId, lines]) => {
        const content = Array.isArray(lines) ? lines.join('\n') : '';
        return `### ${nodeId}\n\n\`\`\`text\n${content}\n\`\`\``;
      }).join(MARKDOWN_SECTION_BREAK),
    );
  }

  const nodeDiagnostics = bundle?.nodeDiagnostics &&
    typeof bundle.nodeDiagnostics === 'object' ?
    Object.entries(bundle.nodeDiagnostics) :
    [];
  if (nodeDiagnostics.length > ZERO) {
    sections.push(
      '## Node Diagnostics\n' +
      nodeDiagnostics.map(([nodeId, nodeDiagnostic]) => {
        const lines = [];
        if (nodeDiagnostic?.logPath) {
          lines.push(`- Log Path: ${nodeDiagnostic.logPath}`);
        }
        const loadMetrics = formatNodeDiagnosticLoadMetrics(
          nodeDiagnostic?.loadMetrics,
        );
        if (loadMetrics) {
          lines.push(`- Load Metrics: ${loadMetrics}`);
        }
        if (nodeDiagnostic?.readiness) {
          lines.push(
            `- Readiness: ${formatReadinessDimensions(nodeDiagnostic.readiness)}`,
          );
        }
        if (nodeDiagnostic?.placementEligibility) {
          lines.push(
            '- Placement Eligibility: ' +
              String(
                nodeDiagnostic.placementEligibility.placementEligible === true ?
                  'eligible' :
                  'ineligible',
              ) +
              ` (failedDimensions=${formatList(
                nodeDiagnostic.placementEligibility.failedDimensions,
              )}, reasonCodes=${formatList(
                nodeDiagnostic.placementEligibility.reasonCodes,
              )})`,
          );
        }
        if (nodeDiagnostic?.publicationMode) {
          lines.push(
            `- Publication Mode: ${formatPublicationMode(nodeDiagnostic.publicationMode)}`,
          );
        }
        if (nodeDiagnostic?.heartbeatPublication) {
          lines.push(
            '- Heartbeat Publication: ' +
              formatHeartbeatPublication(nodeDiagnostic.heartbeatPublication),
          );
        }
        if (nodeDiagnostic?.nodeLiveness) {
          lines.push(
            `- Node Liveness: ${formatNodeLiveness(nodeDiagnostic.nodeLiveness)}`,
          );
        }
        if (nodeDiagnostic?.timelineCorrelation) {
          lines.push(
            '- Timeline Correlation: ' +
              formatTimelineCorrelation(nodeDiagnostic.timelineCorrelation),
          );
        }
        if (nodeDiagnostic?.routingDiagnostics) {
          lines.push(
            '- Routing Diagnostics: ' +
              formatRoutingDiagnostics(nodeDiagnostic.routingDiagnostics),
          );
        }
        const readinessTransitions = Array.isArray(
          nodeDiagnostic?.readinessTransitions,
        ) ?
          nodeDiagnostic.readinessTransitions :
          [];
        if (readinessTransitions.length > ZERO) {
          lines.push(
            '- First Readiness Flip: ' +
              formatReadinessTransition(readinessTransitions[ZERO]),
          );
        }
        const errors = Array.isArray(nodeDiagnostic?.errors) ?
          nodeDiagnostic.errors :
          [];
        if (errors.length > ZERO) {
          for (const errorText of errors) {
            lines.push(`- Error: ${errorText}`);
          }
        }
        const traces = Array.isArray(nodeDiagnostic?.adminQueryTrace) ?
          nodeDiagnostic.adminQueryTrace :
          [];
        if (traces.length > ZERO) {
          lines.push('```text');
          for (const traceEntry of traces) {
            lines.push(formatAdminQueryTraceEntry(traceEntry));
          }
          lines.push('```');
        }
        return `### ${nodeId}\n\n${lines.join('\n')}`;
      }).join(MARKDOWN_SECTION_BREAK),
    );
  }

  const publicationModes = bundle?.controlPlane?.publicationModeByNodeId &&
    typeof bundle.controlPlane.publicationModeByNodeId === 'object' ?
    Object.entries(bundle.controlPlane.publicationModeByNodeId) :
    [];
  const heartbeatPublications =
    bundle?.controlPlane?.heartbeatPublicationByNodeId &&
    typeof bundle.controlPlane.heartbeatPublicationByNodeId === 'object' ?
      Object.entries(bundle.controlPlane.heartbeatPublicationByNodeId) :
      [];
  const workflowAdmissions = bundle?.controlPlane?.workflowAdmissionsByWorkflowId &&
    typeof bundle.controlPlane.workflowAdmissionsByWorkflowId === 'object' ?
    Object.entries(bundle.controlPlane.workflowAdmissionsByWorkflowId) :
    [];
  const readinessTransitionsByNodeId =
    bundle?.controlPlane?.readinessTransitionsByNodeId &&
    typeof bundle.controlPlane.readinessTransitionsByNodeId === 'object' ?
      Object.entries(bundle.controlPlane.readinessTransitionsByNodeId) :
      [];
  const timeoutClassifications = Array.isArray(
    bundle?.controlPlane?.timeoutClassifications,
  ) ?
    bundle.controlPlane.timeoutClassifications :
    [];
  if (publicationModes.length > ZERO ||
      heartbeatPublications.length > ZERO ||
      readinessTransitionsByNodeId.length > ZERO ||
      workflowAdmissions.length > ZERO ||
      timeoutClassifications.length > ZERO) {
    const controlPlaneSections = [];
    if (publicationModes.length > ZERO) {
      controlPlaneSections.push(
        '### Publication Modes\n' +
        publicationModes
          .map(([nodeId, publicationMode]) =>
            `- ${nodeId}: ${formatPublicationMode(publicationMode)}`,
          )
          .join('\n'),
      );
    }
    if (heartbeatPublications.length > ZERO) {
      controlPlaneSections.push(
        '### Heartbeat Publications\n' +
        heartbeatPublications
          .map(([nodeId, publication]) =>
            `- ${nodeId}: ${formatHeartbeatPublication(publication)}`,
          )
          .join('\n'),
      );
    }
    if (workflowAdmissions.length > ZERO) {
      controlPlaneSections.push(
        '### Workflow Admissions\n' +
        workflowAdmissions
          .map(([workflowId, workflow]) =>
            `- ${workflowId}: ${formatWorkflowAdmission(workflow)}`,
          )
          .join('\n'),
      );
    }
    if (readinessTransitionsByNodeId.length > ZERO) {
      controlPlaneSections.push(
        '### Readiness Flips\n' +
        readinessTransitionsByNodeId
          .map(([nodeId, transitions]) => {
            const firstTransition =
              Array.isArray(transitions) ? transitions[ZERO] : null;
            return `- ${nodeId}: ` +
              formatReadinessTransition(firstTransition);
          })
          .join('\n'),
      );
    }
    if (timeoutClassifications.length > ZERO) {
      controlPlaneSections.push(
        '### Timeout Classifications\n' +
        timeoutClassifications
          .map((entry) => `- ${formatTimeoutClassificationEntry(entry)}`)
          .join('\n'),
      );
    }
    sections.push(
      '## Control Plane Diagnostics\n' +
      controlPlaneSections.join(MARKDOWN_SECTION_BREAK),
    );
  }

  const channelMetrics = bundle?.diagnostics?.rootCauseBundle?.channelMetrics &&
    typeof bundle.diagnostics.rootCauseBundle.channelMetrics === 'object' ?
    Object.entries(bundle.diagnostics.rootCauseBundle.channelMetrics) :
    [];
  const channelStateByChannel = bundle?.diagnostics?.rootCauseBundle?.channelStateByChannel &&
    typeof bundle.diagnostics.rootCauseBundle.channelStateByChannel === 'object' ?
    Object.entries(bundle.diagnostics.rootCauseBundle.channelStateByChannel) :
    [];
  if (channelMetrics.length > ZERO || channelStateByChannel.length > ZERO) {
    const nodeClientSections = [];
    if (channelMetrics.length > ZERO) {
      nodeClientSections.push(
        '### Metrics\n' +
        channelMetrics
          .map(([channel, metrics]) =>
            formatNodeClientChannelMetrics(channel, metrics),
          )
          .join('\n'),
      );
    }
    if (channelStateByChannel.length > ZERO) {
      nodeClientSections.push(
        '### Channel State\n' +
        channelStateByChannel
          .flatMap(([channel, nodeStates]) =>
            Object.entries(
              nodeStates && typeof nodeStates === 'object' ? nodeStates : {},
            )
              .map(([nodeId, state]) =>
                formatNodeClientChannelState(channel, nodeId, state)),
          )
          .join('\n'),
      );
    }
    sections.push(
      '## Node Client Channels\n' +
      nodeClientSections.join(MARKDOWN_SECTION_BREAK),
    );
  }

  return sections.join(MARKDOWN_SECTION_BREAK) + '\n';
}

function buildRunFailureBundle({
  reportOutputPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  scenarioBundles,
}) {
  return {
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    reportPath: reportOutputPath,
    reportSummary,
    standardSummary,
    benchmarkRegressionGate: benchmarkRegressionGate || null,
    failedScenarioCount: scenarioBundles.length,
    scenarios: scenarioBundles.map((bundle) => ({
      scenario: bundle.scenario,
      summary: bundle.summary,
      jsonPath: bundle.links.jsonPath,
      markdownPath: bundle.links.markdownPath,
    })),
  };
}

function renderRunFailureBundleMarkdown(bundle) {
  return [
    '# Run Failure Bundle',
    `- Report: ${bundle.reportPath || UNKNOWN_VALUE}`,
    `- Failed Scenarios: ${bundle.failedScenarioCount}`,
    '## Scenarios\n' + (
      Array.isArray(bundle.scenarios) && bundle.scenarios.length > ZERO ?
        bundle.scenarios.map((scenario) =>
          `- ${scenario.scenario}: ` +
            `${scenario.summary.phase || UNKNOWN_VALUE} ` +
            `(${scenario.markdownPath})`,
        ).join('\n') :
        '- none'
    ),
  ].join(MARKDOWN_SECTION_BREAK) + '\n';
}

function ensureScenarioDiagnostics(entry) {
  if (!isRecord(entry)) {
    return null;
  }
  if (!isRecord(entry.details)) {
    entry.details = {};
  }
  if (!isRecord(entry.details.diagnostics)) {
    entry.details.diagnostics = {};
  }
  return entry.details.diagnostics;
}

function applyBundleDiagnosticsToScenarioEntry(entry, bundleJson) {
  const diagnostics = ensureScenarioDiagnostics(entry);
  if (!diagnostics || !isRecord(bundleJson)) {
    return;
  }

  if (isRecord(bundleJson.diagnostics?.failure)) {
    diagnostics.failure = bundleJson.diagnostics.failure;
  }

  if (isRecord(bundleJson.diagnostics?.firstFaultTimeline)) {
    diagnostics.firstFaultTimeline = bundleJson.diagnostics.firstFaultTimeline;
  }

  if (isRecord(bundleJson.readiness?.nodeReasonsByNodeId)) {
    if (!isRecord(diagnostics.failedPhase)) {
      diagnostics.failedPhase = {};
    }
    if (!isRecord(diagnostics.failedPhase.artifacts)) {
      diagnostics.failedPhase.artifacts = {};
    }
    diagnostics.failedPhase.artifacts.nodeReasonsByNodeId =
      bundleJson.readiness.nodeReasonsByNodeId;
  }
}

export async function writeFailureBundlesForReport({
  scenarios,
  reportOutputPath,
  outputDir,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  workspaceRoot = process.cwd(),
}) {
  const scenarioEntries = Array.isArray(scenarios) ? scenarios : [];
  const absoluteOutputDir = resolve(String(outputDir || '.'));
  const absoluteReportPath = resolve(String(reportOutputPath || ''));
  const scenarioBundles = [];

  for (const entry of scenarioEntries) {
    if (!entry || entry.passed === true) {
      continue;
    }
    const scenarioName = sanitizePathSegment(entry.scenario, 'scenario');
    const scenarioDir = join(absoluteOutputDir, scenarioName);
    await mkdir(scenarioDir, {recursive: true});
    const logs = await collectScenarioLogArtifacts(
      scenarioDir,
      resolveRelevantNodeIds(entry),
      workspaceRoot,
    );
    const bundleJson = buildScenarioFailureBundle({
      entry,
      reportOutputPath: toWorkspaceRelative(absoluteReportPath, workspaceRoot),
      reportSummary,
      standardSummary,
      benchmarkRegressionGate,
      logs,
    });
    applyBundleDiagnosticsToScenarioEntry(entry, bundleJson);
    const jsonAbsolutePath = join(scenarioDir, FAILURE_BUNDLE_JSON_FILENAME);
    const markdownAbsolutePath = join(scenarioDir, FAILURE_BUNDLE_MARKDOWN_FILENAME);
    await writeFile(
      jsonAbsolutePath,
      JSON.stringify(bundleJson, null, 2),
      UTF8_ENCODING,
    );
    await writeFile(
      markdownAbsolutePath,
      renderScenarioFailureBundleMarkdown(bundleJson),
      UTF8_ENCODING,
    );
    const links = {
      jsonPath: toWorkspaceRelative(jsonAbsolutePath, workspaceRoot),
      markdownPath: toWorkspaceRelative(markdownAbsolutePath, workspaceRoot),
    };
    entry.failureBundle = links;
    scenarioBundles.push({
      scenario: entry.scenario,
      summary: bundleJson.summary,
      links,
    });
  }

  if (scenarioBundles.length === ZERO) {
    return {runBundle: null, scenarioBundles: []};
  }

  const runBundleDir = join(absoluteOutputDir, FAILURE_BUNDLE_RUN_DIRNAME);
  await mkdir(runBundleDir, {recursive: true});
  const runBundleJson = buildRunFailureBundle({
    reportOutputPath: toWorkspaceRelative(absoluteReportPath, workspaceRoot),
    reportSummary,
    standardSummary,
    benchmarkRegressionGate,
    scenarioBundles,
  });
  const runJsonAbsolutePath = join(runBundleDir, RUN_FAILURE_BUNDLE_JSON_FILENAME);
  const runMarkdownAbsolutePath = join(
    runBundleDir,
    RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME,
  );
  await writeFile(
    runJsonAbsolutePath,
    JSON.stringify(runBundleJson, null, 2),
    UTF8_ENCODING,
  );
  await writeFile(
    runMarkdownAbsolutePath,
    renderRunFailureBundleMarkdown(runBundleJson),
    UTF8_ENCODING,
  );

  return {
    runBundle: {
      jsonPath: toWorkspaceRelative(runJsonAbsolutePath, workspaceRoot),
      markdownPath: toWorkspaceRelative(runMarkdownAbsolutePath, workspaceRoot),
    },
    scenarioBundles,
  };
}
