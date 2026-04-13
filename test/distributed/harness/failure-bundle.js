import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {ENTRYPOINT_LOG_MSG} from '../../../src/constants/entrypoint.js';
import {classifyActiveGateClosureWitness} from './active-gate-closure-classification.js';
import {
  ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE,
  ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT,
  ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT,
  ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE,
  ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_TERMINAL,
  STARTUP_READINESS_MODE_STARTUP,
} from './startup-readiness-evidence.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON_FALLBACK,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_INVARIANT_FALLBACK,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';

const FAILURE_BUNDLE_SCHEMA_VERSION = 1;
const FAILURE_BUNDLE_RUN_DIRNAME = 'failure-bundles';
const FAILURE_BUNDLE_JSON_FILENAME = 'failure-bundle.json';
const FAILURE_BUNDLE_MARKDOWN_FILENAME = 'failure-bundle.md';
const TRIAGE_SUMMARY_JSON_FILENAME = 'triage-summary.json';
const TRIAGE_SUMMARY_MARKDOWN_FILENAME = 'triage-summary.md';
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
const READINESS_FAILURE_CLASS_NO_PROGRESS = 'no_progress_terminal';
const NODE_DIAGNOSTICS_TRACE_LIMIT = 5;
const NODE_ID_ERROR_PATTERN = /\bnode=([a-z0-9._:-]+)\b/gi;
const PLAYBACK_EVENTS_FILENAME = 'events.ndjson';
const PLAYBACK_EVENT_TYPE_CLUSTER_STAGE = 'cluster.stage';
const PLAYBACK_EVENT_TYPE_LOAD_STARTED = 'load.started';
const PLAYBACK_EVENT_TYPE_LOAD_PROGRESS = 'load.progress';
const PLAYBACK_EVENT_TYPE_LOAD_COMPLETED = 'load.completed';
const PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY = 'node.restart.boundary';
const PLAYBACK_EVENT_TYPE_PARTITION_CREATED = 'partition.created';
const PLAYBACK_EVENT_TYPE_REPLICA_CREATED = 'replica.created';
const PLAYBACK_EVENT_TYPE_REPLICA_REMOVED = 'replica.removed';
const PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE =
  'setup.cluster.waiting-active';
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
const FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED =
  'publication_convergence_blocked';
const FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED =
  'startup_recovery_blocked';
const FAILURE_CLASS_DISCOVERY_UNAVAILABLE = 'discovery_unavailable';
const FAILURE_CLASS_TOPOLOGY_UNSTABLE = 'topology_unstable';
const FAILURE_CLASS_LOAD_PRESSURE = 'load_pressure';
const FAILURE_CLASS_CDC_DEGRADED = 'cdc_degraded';
const FAILURE_CLASS_CACHE_STALE = 'cache_stale';
const FAILURE_CLASS_VERIFICATION_MISMATCH = 'verification_mismatch';
const FAILURE_CLASS_UNKNOWN = 'unknown';
const FAILURE_CLASS_CONFIDENCE_HIGH = 'high';
const FAILURE_CLASS_CONFIDENCE_MEDIUM = 'medium';
const FAILURE_CLASS_CONFIDENCE_LOW = 'low';
const TRIAGE_CLUSTER_STAGE_LIMIT = 12;
const TRIAGE_RECENT_TOPOLOGY_EVENT_LIMIT = 10;
const TRIAGE_TOP_LOAD_NODE_LIMIT = 5;

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

function resolveStructuredLogMessage(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return '';
  }
  if (typeof parsed.msg === 'string') {
    return parsed.msg;
  }
  if (typeof parsed.message === 'string') {
    return parsed.message;
  }
  return '';
}

function resolveStructuredLogTimestamp(parsed) {
  if (typeof parsed?.time === 'string' && parsed.time.length > ZERO) {
    return parsed.time;
  }
  if (typeof parsed?.timestamp === 'string' && parsed.timestamp.length > ZERO) {
    return parsed.timestamp;
  }
  return null;
}

function sanitizeStructuredDecisionArtifact(parsed, fields) {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const artifact = {
    timestamp: resolveStructuredLogTimestamp(parsed),
  };
  for (const field of fields) {
    if (!Object.hasOwn(parsed, field)) {
      continue;
    }
    artifact[field] = parsed[field];
  }
  return artifact;
}

function extractDecisionArtifactsFromLogContent(content) {
  const startupDecisions = [];
  const runtimeHandoffs = [];
  const lines = String(content || '').split('\n');
  for (const line of lines) {
    const parsed = parseStructuredLogLine(line);
    if (!parsed) {
      continue;
    }
    const message = resolveStructuredLogMessage(parsed);
    if (message === ENTRYPOINT_LOG_MSG.AUTO_REJOIN_DECISION) {
      startupDecisions.push(sanitizeStructuredDecisionArtifact(parsed, [
        'nodeId',
        'mode',
        'source',
        'startupMode',
        'peerAddress',
      ]));
      continue;
    }
    if (message === ENTRYPOINT_LOG_MSG.STARTUP_RUNTIME_HANDOFF) {
      runtimeHandoffs.push(sanitizeStructuredDecisionArtifact(parsed, [
        'nodeId',
        'startupBranch',
        'startupPhase',
        'bootstrapApiHasSqlQueryEngine',
        'bootstrapApiHasMessageRouter',
        'bootstrapApiHasStartupRecoveryCoordinator',
        'adminRuntimeStarted',
        'adminPort',
      ]));
    }
  }
  if (startupDecisions.length === ZERO && runtimeHandoffs.length === ZERO) {
    return null;
  }
  return {
    startupDecisions: startupDecisions.filter(Boolean),
    runtimeHandoffs: runtimeHandoffs.filter(Boolean),
    latestStartupDecision:
      startupDecisions.length > ZERO ? startupDecisions[startupDecisions.length - 1] : null,
    latestRuntimeHandoff:
      runtimeHandoffs.length > ZERO ? runtimeHandoffs[runtimeHandoffs.length - 1] : null,
  };
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

function normalizeActiveGateReadinessDelay(rawDelay = null) {
  if (!isRecord(rawDelay)) {
    return null;
  }
  const normalized = {
    timedOut: rawDelay.timedOut === true,
    cause: typeof rawDelay.cause === 'string' ? rawDelay.cause.trim() : null,
    source: typeof rawDelay.source === 'string' ? rawDelay.source.trim() : null,
    recoverability: typeof rawDelay.recoverability === 'string' ?
      rawDelay.recoverability.trim() :
      null,
    error: typeof rawDelay.error === 'string' ? rawDelay.error.trim() : null,
  };
  if (
    normalized.timedOut === false &&
    normalized.cause === null &&
    normalized.source === null &&
    normalized.recoverability === null &&
    normalized.error === null
  ) {
    return null;
  }
  return normalized;
}

function appendActiveGateReadinessDelaySignals(signals = [], delay = null) {
  if (!Array.isArray(signals)) {
    return [];
  }
  const normalized = normalizeActiveGateReadinessDelay(delay);
  if (!normalized) {
    return signals;
  }
  signals.push(
    'activeGateReadinessDelay=' +
      (normalized.timedOut === true ? 'timeout' : 'none'),
  );
  if (normalized.cause && normalized.cause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE) {
    signals.push('activeGateReadinessCause=' + normalized.cause);
  }
  if (normalized.recoverability) {
    signals.push('activeGateReadinessRecoverability=' + normalized.recoverability);
  }
  if (normalized.source) {
    signals.push('activeGateReadinessDelaySource=' + normalized.source);
  }
  return signals;
}

function appendReadinessFailureSignals(signals = [], readinessFailure = null) {
  const normalized = normalizeReadinessFailure(readinessFailure);
  if (!normalized) {
    return signals;
  }
  if (normalized.classCode) {
    signals.push('activeGateReadinessClass=' + normalized.classCode);
  }
  if (normalized.recoverability) {
    signals.push('activeGateReadinessRecoverability=' + normalized.recoverability);
  }
  if (normalized.mode) {
    signals.push('activeGateReadinessMode=' + normalized.mode);
  }
  if (Number.isInteger(normalized.progressSignal?.attemptsSinceProgress)) {
    signals.push(
      'activeGateReadinessProgressAttemptsSince=' +
        String(normalized.progressSignal.attemptsSinceProgress),
    );
  }
  if (Number.isInteger(normalized.progressSignal?.maxAttempts)) {
    signals.push(
      'activeGateReadinessProgressMaxAttempts=' +
        String(normalized.progressSignal.maxAttempts),
    );
  }
  if (normalized.terminalReason) {
    signals.push('activeGateReadinessTerminalReason=' + normalized.terminalReason);
  }
  return signals;
}

function normalizeReadinessFailure(rawReadinessFailure = null) {
  if (!isRecord(rawReadinessFailure)) {
    return null;
  }
  const progressSignal = isRecord(rawReadinessFailure.progressSignal) ?
    rawReadinessFailure.progressSignal :
    null;
  const normalized = {
    mode: typeof rawReadinessFailure.mode === 'string' &&
      rawReadinessFailure.mode.length > ZERO ?
      rawReadinessFailure.mode :
      null,
    classCode: typeof rawReadinessFailure.classCode === 'string' &&
      rawReadinessFailure.classCode.length > ZERO ?
      rawReadinessFailure.classCode :
      null,
    recoverability: typeof rawReadinessFailure.recoverability === 'string' &&
      rawReadinessFailure.recoverability.length > ZERO ?
      rawReadinessFailure.recoverability :
      null,
    progressSignal: isRecord(progressSignal) ? {
      attemptsSinceProgress: Number.isInteger(progressSignal.attemptsSinceProgress) ?
        Math.max(ZERO, progressSignal.attemptsSinceProgress) :
        null,
      maxAttempts: Number.isInteger(progressSignal.maxAttempts) &&
        progressSignal.maxAttempts > ZERO ?
        Math.max(ZERO, progressSignal.maxAttempts) :
        null,
      stalled: progressSignal.stalled === true,
    } : null,
    terminalReason: typeof rawReadinessFailure.terminalReason === 'string' &&
      rawReadinessFailure.terminalReason.length > ZERO ?
      rawReadinessFailure.terminalReason :
      null,
    source: typeof rawReadinessFailure.source === 'string' &&
      rawReadinessFailure.source.length > ZERO ?
      rawReadinessFailure.source :
      null,
    cause: typeof rawReadinessFailure.cause === 'string' &&
      rawReadinessFailure.cause.length > ZERO ?
      rawReadinessFailure.cause :
      null,
    error: typeof rawReadinessFailure.error === 'string' &&
      rawReadinessFailure.error.length > ZERO ?
      rawReadinessFailure.error :
      null,
  };
  if (
    normalized.classCode === null &&
    normalized.recoverability === null &&
    normalized.terminalReason === null &&
    normalized.source === null &&
    normalized.cause === null &&
    normalized.error === null
  ) {
    return null;
  }
  return normalized;
}

function resolveReadinessFailure(controlPlane = {}) {
  const activeGateNoProgress = controlPlane?.activeGateNoProgress &&
    typeof controlPlane.activeGateNoProgress === 'object' ?
    controlPlane.activeGateNoProgress :
    null;
  const explicit = normalizeReadinessFailure(
    activeGateNoProgress?.readinessFailure || null,
  );
  if (explicit) {
    return explicit;
  }
  const readinessDelay = normalizeActiveGateReadinessDelay(
    activeGateNoProgress?.readinessDelay ||
      controlPlane?.activeGateProgress?.readinessDelay ||
      controlPlane?.activeGateBestProgress?.readinessDelay ||
      activeGateNoProgress?.currentProgress?.readinessDelay ||
      null,
  );
  if (!isRecord(activeGateNoProgress) &&
      !readinessDelay) {
    return null;
  }
  const attemptsSinceProgress = Number.isInteger(
    activeGateNoProgress?.attemptsSinceProgress,
  ) ? Math.max(ZERO, activeGateNoProgress.attemptsSinceProgress) : null;
  const maxAttempts = Number.isInteger(activeGateNoProgress?.maxAttempts) &&
    activeGateNoProgress.maxAttempts > ZERO ?
    Math.max(ZERO, activeGateNoProgress.maxAttempts) :
    null;
  const stalled = activeGateNoProgress?.stalled === true;
  const reasonCode = activeGateNoProgress?.reasonCode;
  const classCode = readinessDelay &&
    readinessDelay.timedOut === true &&
    readinessDelay.cause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE ?
    readinessDelay.cause :
    (stalled || reasonCode === NO_PROGRESS_REASON_CODE ?
      READINESS_FAILURE_CLASS_NO_PROGRESS :
      null);
  return normalizeReadinessFailure({
    mode: activeGateNoProgress?.mode || null,
    classCode,
    recoverability: readinessDelay?.recoverability || null,
    progressSignal: {
      attemptsSinceProgress,
      maxAttempts,
      stalled,
    },
    terminalReason: typeof reasonCode === 'string' &&
      reasonCode.length > ZERO ?
      reasonCode :
      null,
    source: readinessDelay?.source || null,
    cause: readinessDelay?.cause || null,
    error: readinessDelay?.error || null,
  });
}

function resolveReadinessFailureGuidance(readinessFailure = null) {
  if (!isRecord(readinessFailure) ||
      readinessFailure.classCode === null) {
    return {
      failureAction: null,
      operatorRecommendation: null,
    };
  }
  if (readinessFailure.classCode === ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT ||
      readinessFailure.classCode ===
        ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT) {
    if (readinessFailure.recoverability ===
      ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE) {
      return {
        failureAction: 'Probe delay is recoverable in this path; allow bounded retry.',
        operatorRecommendation: 'Re-run with reduced startup concurrency and watch snapshot probe latencies.',
      };
    }
    return {
      failureAction: 'Snapshot/reachability timeout is blocking convergence.',
      operatorRecommendation: 'Inspect snapshot query latency, admin readiness, and host/network stability before rerun.',
    };
  }
  if (readinessFailure.classCode === READINESS_FAILURE_CLASS_NO_PROGRESS) {
    return {
      failureAction: 'Convergence has stopped progressing within configured guarantees.',
      operatorRecommendation: 'Inspect publication convergence blockers and topology readiness evidence before retry.',
    };
  }
  return {
    failureAction: 'Readiness convergence issue requires triage.',
    operatorRecommendation: 'Collect active-gate diagnostics and follow triage priorities before rerun.',
  };
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

function normalizeDistinctStringArray(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value || '').trim();
    if (normalized.length === ZERO || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function buildPriorityRecoveryCorrelationKey({
  partitionId,
  epoch = null,
  operationId = null,
  fallback = null,
}) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === ZERO) {
    return String(fallback || PRIORITY_RECOVERY_CORRELATION_KEY.UNKNOWN);
  }
  const normalizedEpoch = Number.isFinite(epoch) ?
    String(Math.floor(epoch)) :
    PRIORITY_RECOVERY_CORRELATION_KEY.EPOCH_UNKNOWN;
  const normalizedOperationId = String(operationId || '').trim();
  return [
    normalizedPartitionId,
    normalizedEpoch,
    normalizedOperationId.length > ZERO ?
      normalizedOperationId :
      PRIORITY_RECOVERY_CORRELATION_KEY.OPERATION_UNKNOWN,
  ].join(PRIORITY_RECOVERY_CORRELATION_KEY.SEPARATOR);
}

function normalizePriorityRecoverySemanticStateId(semanticState) {
  const normalizedSemanticState = String(semanticState || '').trim();
  if (normalizedSemanticState.length === ZERO) {
    return null;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(normalizedSemanticState) ?
    normalizedSemanticState :
    null;
}

function inferPriorityRecoverySemanticState(snapshot, blockerReasons = []) {
  for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
    if (!blockerReasons.includes(blockerReason)) {
      continue;
    }
    return PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
  }
  if (snapshot?.planner?.ready === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
  }
  if (snapshot?.spreadCompletion?.satisfied === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  if (Number(snapshot?.coordinator?.operationCount) > ZERO ||
      (typeof snapshot?.operationId === 'string' &&
      snapshot.operationId.length > ZERO)) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
}

function normalizePriorityRecoveryDecisionSnapshots(value) {
  if (!isRecord(value)) {
    return null;
  }
  const snapshots = [];
  const partitionIdSet = new Set();
  const blockerPartitionIdsByReason = {};
  const partitionIdsBySemanticState = {};
  for (const progressClassId of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    blockerPartitionIdsByReason[progressClassId] = new Set();
  }
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  if (isRecord(value.blockerPartitionIdsByReason)) {
    for (const [blockerReason, partitionIds] of Object.entries(
      value.blockerPartitionIdsByReason,
    )) {
      const normalizedBlockerReason = String(blockerReason || '').trim();
      if (normalizedBlockerReason.length === ZERO) {
        continue;
      }
      if (!(blockerPartitionIdsByReason[normalizedBlockerReason] instanceof Set)) {
        blockerPartitionIdsByReason[normalizedBlockerReason] = new Set();
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        blockerPartitionIdsByReason[normalizedBlockerReason].add(partitionId);
      }
    }
  }
  if (isRecord(value.partitionIdsBySemanticState)) {
    for (const [semanticState, partitionIds] of Object.entries(
      value.partitionIdsBySemanticState,
    )) {
      const normalizedSemanticState =
        normalizePriorityRecoverySemanticStateId(semanticState);
      if (!normalizedSemanticState) {
        continue;
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        partitionIdsBySemanticState[normalizedSemanticState].add(partitionId);
      }
    }
  }

  for (const snapshot of Array.isArray(value.snapshots) ? value.snapshots : []) {
    if (!isRecord(snapshot)) {
      continue;
    }
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    partitionIdSet.add(partitionId);
    const epoch = Number.isFinite(snapshot.epoch) ?
      Math.floor(snapshot.epoch) :
      null;
    const operationId = String(snapshot.operationId || '').trim() || null;
    const blockerReasons = normalizeDistinctStringArray(snapshot.blockerReasons);
    for (const blockerReason of blockerReasons) {
      if (!(blockerPartitionIdsByReason[blockerReason] instanceof Set)) {
        blockerPartitionIdsByReason[blockerReason] = new Set();
      }
      blockerPartitionIdsByReason[blockerReason].add(partitionId);
    }
    const semanticState =
      normalizePriorityRecoverySemanticStateId(snapshot.semanticState) ||
      inferPriorityRecoverySemanticState(snapshot, blockerReasons);
    if (partitionIdsBySemanticState[semanticState] instanceof Set) {
      partitionIdsBySemanticState[semanticState].add(partitionId);
    }
    snapshots.push({
      partitionId,
      epoch,
      operationId,
      correlationKey: buildPriorityRecoveryCorrelationKey({
        partitionId,
        epoch,
        operationId,
        fallback: snapshot.correlationKey,
      }),
      planner: isRecord(snapshot.planner) ? cloneJsonValue(snapshot.planner) : null,
      admission: isRecord(snapshot.admission) ?
        cloneJsonValue(snapshot.admission) :
        null,
      coordinator: isRecord(snapshot.coordinator) ?
        cloneJsonValue(snapshot.coordinator) :
        null,
      publication: isRecord(snapshot.publication) ?
        cloneJsonValue(snapshot.publication) :
        null,
      readiness: isRecord(snapshot.readiness) ?
        cloneJsonValue(snapshot.readiness) :
        null,
      blockerReasons,
      semanticState,
    });
  }

  const normalizedBlockerPartitionIdsByReason = {};
  for (const [blockerReason, partitionIds] of Object.entries(
    blockerPartitionIdsByReason,
  )) {
    normalizedBlockerPartitionIdsByReason[blockerReason] = [...partitionIds].sort();
  }
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = [...partitionIds].sort();
  }
  const publicationEpoch = Number.isFinite(value.publicationEpoch) ?
    Math.floor(value.publicationEpoch) :
    null;
  return {
    schemaVersion: Number.isFinite(value.schemaVersion) ?
      Math.floor(value.schemaVersion) :
      null,
    capturedAt: value.capturedAt || null,
    publicationEpoch,
    snapshots: snapshots.sort((left, right) => {
      const partitionDelta = left.partitionId.localeCompare(right.partitionId);
      if (partitionDelta !== ZERO) {
        return partitionDelta;
      }
      const leftEpoch = Number.isFinite(left.epoch) ? left.epoch : -1;
      const rightEpoch = Number.isFinite(right.epoch) ? right.epoch : -1;
      if (leftEpoch !== rightEpoch) {
        return leftEpoch - rightEpoch;
      }
      return left.correlationKey.localeCompare(right.correlationKey);
    }),
    snapshotCount: snapshots.length,
    partitionCount: partitionIdSet.size,
    blockerPartitionIdsByReason: normalizedBlockerPartitionIdsByReason,
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
  };
}

function mergePriorityRecoveryDecisionSnapshots(primary, fallback) {
  const normalizedPrimary = normalizePriorityRecoveryDecisionSnapshots(primary);
  const normalizedFallback = normalizePriorityRecoveryDecisionSnapshots(fallback);
  if (!normalizedPrimary && !normalizedFallback) {
    return null;
  }
  if (!normalizedPrimary) {
    return normalizedFallback;
  }
  if (!normalizedFallback) {
    return normalizedPrimary;
  }

  const snapshotsByCorrelationKey = new Map();
  for (const source of [normalizedFallback, normalizedPrimary]) {
    for (const snapshot of source.snapshots) {
      const correlationKey = buildPriorityRecoveryCorrelationKey({
        partitionId: snapshot.partitionId,
        epoch: snapshot.epoch,
        operationId: snapshot.operationId,
        fallback: snapshot.correlationKey,
      });
      snapshotsByCorrelationKey.set(correlationKey, snapshot);
    }
  }

  const blockerPartitionIdsByReason = {};
  const partitionIdsBySemanticState = {};
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  for (const source of [normalizedFallback, normalizedPrimary]) {
    for (const [blockerReason, partitionIds] of Object.entries(
      source.blockerPartitionIdsByReason || {},
    )) {
      if (!(blockerPartitionIdsByReason[blockerReason] instanceof Set)) {
        blockerPartitionIdsByReason[blockerReason] = new Set();
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        blockerPartitionIdsByReason[blockerReason].add(partitionId);
      }
    }
    for (const [semanticState, partitionIds] of Object.entries(
      source.partitionIdsBySemanticState || {},
    )) {
      const normalizedSemanticState =
        normalizePriorityRecoverySemanticStateId(semanticState);
      if (!normalizedSemanticState) {
        continue;
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        partitionIdsBySemanticState[normalizedSemanticState].add(partitionId);
      }
    }
  }
  for (const snapshot of snapshotsByCorrelationKey.values()) {
    for (const blockerReason of normalizeDistinctStringArray(snapshot.blockerReasons)) {
      if (!(blockerPartitionIdsByReason[blockerReason] instanceof Set)) {
        blockerPartitionIdsByReason[blockerReason] = new Set();
      }
      blockerPartitionIdsByReason[blockerReason].add(snapshot.partitionId);
    }
    const semanticState =
      normalizePriorityRecoverySemanticStateId(snapshot.semanticState) ||
      inferPriorityRecoverySemanticState(snapshot, snapshot.blockerReasons);
    if (partitionIdsBySemanticState[semanticState] instanceof Set) {
      partitionIdsBySemanticState[semanticState].add(snapshot.partitionId);
    }
  }

  const mergedSnapshots = [...snapshotsByCorrelationKey.values()].sort((left, right) => {
    const partitionDelta = String(left.partitionId || '')
      .localeCompare(String(right.partitionId || ''));
    if (partitionDelta !== ZERO) {
      return partitionDelta;
    }
    const leftEpoch = Number.isFinite(left.epoch) ? left.epoch : -1;
    const rightEpoch = Number.isFinite(right.epoch) ? right.epoch : -1;
    if (leftEpoch !== rightEpoch) {
      return leftEpoch - rightEpoch;
    }
    return String(left.correlationKey || '')
      .localeCompare(String(right.correlationKey || ''));
  });
  const mergedPartitionIdSet = new Set(
    mergedSnapshots.map((snapshot) => snapshot.partitionId),
  );
  const normalizedBlockerPartitionIdsByReason = {};
  for (const [blockerReason, partitionIds] of Object.entries(
    blockerPartitionIdsByReason,
  )) {
    normalizedBlockerPartitionIdsByReason[blockerReason] = [...partitionIds].sort();
  }
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = [...partitionIds].sort();
  }

  return {
    schemaVersion:
      normalizedPrimary.schemaVersion ??
      normalizedFallback.schemaVersion ??
      null,
    capturedAt:
      normalizedPrimary.capturedAt ||
      normalizedFallback.capturedAt ||
      null,
    publicationEpoch:
      normalizedPrimary.publicationEpoch ??
      normalizedFallback.publicationEpoch ??
      null,
    snapshots: mergedSnapshots,
    snapshotCount: mergedSnapshots.length,
    partitionCount: mergedPartitionIdSet.size,
    blockerPartitionIdsByReason: normalizedBlockerPartitionIdsByReason,
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
  };
}

function normalizePriorityRecoveryInvariants(value) {
  if (!isRecord(value)) {
    return null;
  }
  const invariantsById = new Map();
  for (const invariant of Array.isArray(value.invariants) ? value.invariants : []) {
    if (!isRecord(invariant)) {
      continue;
    }
    const invariantId = String(invariant.id || '').trim();
    if (invariantId.length === ZERO) {
      continue;
    }
    invariantsById.set(invariantId, {
      id: invariantId,
      invariantId:
        typeof invariant.invariantId === 'string' &&
          invariant.invariantId.length > ZERO ?
          invariant.invariantId :
          invariantId,
      reasonCode:
        typeof invariant.reasonCode === 'string' &&
          invariant.reasonCode.length > ZERO ?
          invariant.reasonCode :
          (typeof invariant.code === 'string' &&
            invariant.code.length > ZERO ?
            invariant.code :
            PRIORITY_RECOVERY_INVARIANT_FALLBACK),
      severity:
        typeof invariant.severity === 'string' &&
          invariant.severity.length > ZERO ?
          invariant.severity :
          null,
      scope:
        typeof invariant.scope === 'string' &&
          invariant.scope.length > ZERO ?
          invariant.scope :
          null,
      owningSubsystem:
        typeof invariant.owningSubsystem === 'string' &&
          invariant.owningSubsystem.length > ZERO ?
          invariant.owningSubsystem :
          null,
      passed: invariant.passed === true,
      details: isRecord(invariant.details) ?
        cloneJsonValue(invariant.details) :
        null,
    });
  }
  const failingInvariantIds = normalizeDistinctStringArray(
    [
      ...Array.from(invariantsById.values())
        .filter((invariant) => invariant.passed !== true)
        .map((invariant) => invariant.id),
      ...normalizeDistinctStringArray(value.failingInvariantIds),
    ],
  );

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
  const failingInvariantIds = normalizeDistinctStringArray(
    [
      ...normalizedFallback.failingInvariantIds,
      ...normalizedPrimary.failingInvariantIds,
      ...Array.from(invariantsById.values())
        .filter((invariant) => invariant.passed !== true)
        .map((invariant) => invariant.id),
    ],
  );
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
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    if (!Array.isArray(blockerReasonHistoryByPartitionId[partitionId])) {
      blockerReasonHistoryByPartitionId[partitionId] = [];
    }
    for (const blockerReason of normalizeDistinctStringArray(snapshot.blockerReasons)) {
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
    const decisionDimension = String(snapshot?.admission?.decisionDimension || '')
      .trim();
    if (decisionDimension.length > ZERO) {
      decisionDimensions.add(decisionDimension);
    }
  }

  const blockerPartitionIdsByReason = {};
  const unresolvedClassIds = [];
  const blockedPartitionIds = new Set();
  for (const [blockerReason, partitionIds] of Object.entries(partitionIdsByReason)) {
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
    normalizedPartitionIdsBySemanticState[semanticState] = [...partitionIds].sort();
  }
  const unresolvedSemanticStateIds = PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS
    .filter((semanticState) =>
      normalizedPartitionIdsBySemanticState[semanticState].length > ZERO,
    );
  const blockedPartitionIdsBySemanticState = new Set();
  for (const semanticState of unresolvedSemanticStateIds) {
    for (const partitionId of normalizedPartitionIdsBySemanticState[semanticState]) {
      blockedPartitionIdsBySemanticState.add(partitionId);
    }
  }
  const effectiveBlockedPartitionIds =
    blockedPartitionIdsBySemanticState.size > ZERO ?
      [...blockedPartitionIdsBySemanticState].sort() :
      [...blockedPartitionIds].sort();

  const partitionBlockerHistory = Object.entries(blockerReasonHistoryByPartitionId)
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
  const partitionWitnesses = effectiveBlockedPartitionIds
    .map((partitionId) => {
      const partitionSnapshots = decisionSnapshots.snapshots.filter((snapshot) =>
        String(snapshot?.partitionId || '').trim() === partitionId,
      );
      const blockerReasons = normalizeDistinctStringArray(
        partitionSnapshots.flatMap((snapshot) =>
          Array.isArray(snapshot?.blockerReasons) ? snapshot.blockerReasons : []),
      );
      const semanticStates = normalizeDistinctStringArray(
        partitionSnapshots
          .map((snapshot) =>
            normalizePriorityRecoverySemanticStateId(snapshot?.semanticState) ||
            inferPriorityRecoverySemanticState(snapshot, blockerReasons),
          )
          .filter(Boolean),
      );
      const decisionDimensions = normalizeDistinctStringArray(
        partitionSnapshots.map((snapshot) =>
          String(snapshot?.admission?.decisionDimension || '').trim(),
        ),
      );
      const eligibleNodeIds = normalizeDistinctStringArray(
        partitionSnapshots.flatMap((snapshot) =>
          Array.isArray(snapshot?.admission?.eligibleNodeIds) ?
            snapshot.admission.eligibleNodeIds :
            []),
      );
      const excludedNodeIds = normalizeDistinctStringArray(
        partitionSnapshots.flatMap((snapshot) =>
          Array.isArray(snapshot?.admission?.recoveryEligibleExcludedNodeIds) ?
            snapshot.admission.recoveryEligibleExcludedNodeIds :
            []),
      );
      const activeLearnerNodeIds = normalizeDistinctStringArray(
        partitionSnapshots.flatMap((snapshot) =>
          Array.isArray(snapshot?.readiness?.learnerPromotion?.activeLearnerNodeIds) ?
            snapshot.readiness.learnerPromotion.activeLearnerNodeIds :
            []),
      );
      const promotableLearnerNodeIds = normalizeDistinctStringArray(
        partitionSnapshots.flatMap((snapshot) =>
          Array.isArray(snapshot?.readiness?.learnerPromotion
            ?.promotableLearnerNodeIds) ?
            snapshot.readiness.learnerPromotion.promotableLearnerNodeIds :
            []),
      );
      const operationIds = normalizeDistinctStringArray(
        partitionSnapshots.flatMap((snapshot) =>
          Array.isArray(snapshot?.coordinator?.operationIds) ?
            snapshot.coordinator.operationIds :
            []),
      );
      const spreadGap = partitionSnapshots
        .map((snapshot) => Number(snapshot?.planner?.spreadGap))
        .filter((value) => Number.isFinite(value))
        .reduce((maximum, value) => Math.max(maximum, value), ZERO);
      const latestOperation = partitionSnapshots
        .map((snapshot) => snapshot?.coordinator?.operation)
        .filter((operation) => isRecord(operation))
        .sort((left, right) =>
          Number(right.updatedAtMs || ZERO) - Number(left.updatedAtMs || ZERO),
        )[0] || null;

      return {
        partitionId,
        semanticState: semanticStates[0] || null,
        blockerReasons,
        spreadGap,
        decisionDimension: decisionDimensions[0] || null,
        eligibleNodeCount: eligibleNodeIds.length,
        recoveryEligibleExcludedNodeIds: excludedNodeIds,
        activeLearnerNodeIds,
        promotableLearnerNodeIds,
        operationIds,
        latestOperationWorkflowStep:
          String(latestOperation?.workflowStep || '').trim() || null,
        latestOperationStatus:
          String(latestOperation?.status || '').trim() || null,
        latestOperationTimelineStep:
          String(latestOperation?.latestTimelineStep || '').trim() || null,
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

function buildPlaybackEventSummary(events) {
  const sortedEvents = [...(Array.isArray(events) ? events : [])]
    .filter((event) => isRecord(event))
    .sort((left, right) =>
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
        stage: typeof details.stage === 'string' ? details.stage : UNKNOWN_VALUE,
        nodeId: typeof details.nodeId === 'string' ? details.nodeId : null,
        attempts: normalizeNonNegativeCount(details.attempts),
        elapsedMs: normalizeNonNegativeCount(details.elapsedMs),
      });
      continue;
    }

    if (event.type === PLAYBACK_EVENT_TYPE_LOAD_STARTED) {
      loadStartedAtMs = timestampMs;
      lastLoadMetrics = resolveLoadMetricsFromPlaybackEvent(event) || lastLoadMetrics;
      continue;
    }
    if (event.type === PLAYBACK_EVENT_TYPE_LOAD_PROGRESS) {
      loadProgressEventCount += 1;
      lastLoadMetrics = resolveLoadMetricsFromPlaybackEvent(event) || lastLoadMetrics;
      continue;
    }
    if (event.type === PLAYBACK_EVENT_TYPE_LOAD_COMPLETED) {
      loadCompletedAtMs = timestampMs;
      lastLoadMetrics = resolveLoadMetricsFromPlaybackEvent(event) || lastLoadMetrics;
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
      entityId: typeof event?.entityId === 'string' ? event.entityId : null,
      partitionId: typeof details.partitionId === 'string' ? details.partitionId : null,
      nodeId: typeof details.nodeId === 'string' ?
        details.nodeId :
        (typeof details.targetNodeId === 'string' ? details.targetNodeId : null),
      status: typeof details.status === 'string' ? details.status : null,
      tableName: typeof details.tableName === 'string' ? details.tableName : null,
      tableId: typeof details.tableId === 'string' ? details.tableId : null,
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
      recentEvents:
        recentTopologyEvents.slice(-TRIAGE_RECENT_TOPOLOGY_EVENT_LIMIT),
    },
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

function cloneJsonValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry));
  }
  if (typeof value !== 'object') {
    return value;
  }
  const cloned = {};
  for (const [key, entry] of Object.entries(value)) {
    cloned[key] = cloneJsonValue(entry);
  }
  return cloned;
}

function resolvePlaybackPublicationConvergence(details) {
  const snapshotCoverage = details?.snapshotCoverage &&
    typeof details.snapshotCoverage === 'object' ?
    details.snapshotCoverage :
    null;
  if (!snapshotCoverage) {
    return null;
  }
  if (snapshotCoverage.selectedPublicationConvergence &&
      typeof snapshotCoverage.selectedPublicationConvergence === 'object') {
    return cloneJsonValue(snapshotCoverage.selectedPublicationConvergence);
  }
  if (snapshotCoverage.selectedPublishedMembershipObservation &&
      typeof snapshotCoverage.selectedPublishedMembershipObservation ===
        'object') {
    return cloneJsonValue(
      snapshotCoverage.selectedPublishedMembershipObservation,
    );
  }
  return null;
}

function resolvePlaybackPublishedMembershipObservation(details) {
  const snapshotCoverage = details?.snapshotCoverage &&
    typeof details.snapshotCoverage === 'object' ?
    details.snapshotCoverage :
    null;
  if (!snapshotCoverage ||
      !snapshotCoverage.selectedPublishedMembershipObservation ||
      typeof snapshotCoverage.selectedPublishedMembershipObservation !==
        'object') {
    return null;
  }
  return cloneJsonValue(snapshotCoverage.selectedPublishedMembershipObservation);
}

function scorePlaybackActiveGateDetails(details) {
  if (!details || typeof details !== 'object') {
    return Number.NEGATIVE_INFINITY;
  }
  const snapshotCoverage = details.snapshotCoverage &&
    typeof details.snapshotCoverage === 'object' ?
    details.snapshotCoverage :
    null;
  const publicationConvergenceGate = details.publicationConvergenceGate &&
    typeof details.publicationConvergenceGate === 'object' ?
    details.publicationConvergenceGate :
    null;
  const bestCoverageNodeCount = Number.isFinite(
    snapshotCoverage?.bestCoverageNodeCount,
  ) ?
    Math.max(ZERO, Math.floor(snapshotCoverage.bestCoverageNodeCount)) :
    ZERO;
  const hasPublicationConvergence = snapshotCoverage?.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === 'object';
  const hasPublishedMembershipObservation =
    snapshotCoverage?.selectedPublishedMembershipObservation &&
    typeof snapshotCoverage.selectedPublishedMembershipObservation === 'object';
  const hasPriorityPartitionSummary =
    (
      snapshotCoverage?.selectedPublicationConvergence?.priorityPartitionSummary &&
      typeof snapshotCoverage.selectedPublicationConvergence
        .priorityPartitionSummary === 'object'
    ) ||
    (
      publicationConvergenceGate?.priorityPartitionSummary &&
      typeof publicationConvergenceGate.priorityPartitionSummary === 'object'
    );
  const hasSelectedError = typeof snapshotCoverage?.selectedError === 'string' &&
    snapshotCoverage.selectedError.length > ZERO;
  const hasActiveGateProgress = details.activeGateProgress &&
    typeof details.activeGateProgress === 'object';
  const hasActiveGateNoProgress = details.activeGateNoProgress &&
    typeof details.activeGateNoProgress === 'object';
  const hasActiveGateBlockerHistory =
    Array.isArray(details.activeGateBlockerHistory) &&
    details.activeGateBlockerHistory.length > ZERO;
  const hasPriorityRecoveryDecisionSnapshots =
    details?.snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots &&
      typeof details.snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots ===
        'object';
  const hasPriorityRecoveryInvariants =
    details.priorityRecoveryInvariants &&
      typeof details.priorityRecoveryInvariants === 'object';
  return (
    (snapshotCoverage?.completeCoverage === true ? 100000 : ZERO) +
    (bestCoverageNodeCount * 1000) +
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

function buildPlaybackControlPlaneFallback(events) {
  const sortedEvents = [...(Array.isArray(events) ? events : [])]
    .filter((event) => isRecord(event))
    .sort((left, right) =>
      Number(left.timestamp || ZERO) - Number(right.timestamp || ZERO),
    );
  let selectedActiveGateDetails = null;
  let selectedActiveGateTimestampMs = null;
  let selectedActiveGateScore = Number.NEGATIVE_INFINITY;

  for (const event of sortedEvents) {
    if (event.type !== PLAYBACK_EVENT_TYPE_CLUSTER_STAGE) {
      continue;
    }
    const details = event?.details && typeof event.details === 'object' ?
      event.details :
      null;
    if (!details ||
        details.stage !== PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE) {
      continue;
    }
    const hasSnapshotCoverage = details.snapshotCoverage &&
      typeof details.snapshotCoverage === 'object';
    const hasPublicationGate = details.publicationConvergenceGate &&
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
      candidateTimestampMs > normalizeNonNegativeCount(
        selectedActiveGateTimestampMs,
      ));
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

  const publicationConvergence =
    resolvePlaybackPublicationConvergence(selectedActiveGateDetails);
  const publishedMembershipObservation =
    resolvePlaybackPublishedMembershipObservation(selectedActiveGateDetails);
  const publicationConvergenceGate =
    selectedActiveGateDetails.publicationConvergenceGate &&
    typeof selectedActiveGateDetails.publicationConvergenceGate === 'object' ?
      cloneJsonValue(selectedActiveGateDetails.publicationConvergenceGate) :
      null;
  const snapshotCoverage = selectedActiveGateDetails.snapshotCoverage &&
    typeof selectedActiveGateDetails.snapshotCoverage === 'object' ?
    cloneJsonValue(selectedActiveGateDetails.snapshotCoverage) :
    null;
  const activeGateProgress = selectedActiveGateDetails.activeGateProgress &&
    typeof selectedActiveGateDetails.activeGateProgress === 'object' ?
    cloneJsonValue(selectedActiveGateDetails.activeGateProgress) :
    null;
  const activeGateBestProgress = selectedActiveGateDetails.activeGateBestProgress &&
    typeof selectedActiveGateDetails.activeGateBestProgress === 'object' ?
    cloneJsonValue(selectedActiveGateDetails.activeGateBestProgress) :
    null;
  const activeGateAdmissionState =
    isRecord(selectedActiveGateDetails.activeGateAdmissionState) ?
      cloneJsonValue(selectedActiveGateDetails.activeGateAdmissionState) :
      null;
  const activeGateNoProgress = selectedActiveGateDetails.activeGateNoProgress &&
    typeof selectedActiveGateDetails.activeGateNoProgress === 'object' ?
    cloneJsonValue(selectedActiveGateDetails.activeGateNoProgress) :
    null;
  const activeGateBlockerHistory =
    Array.isArray(selectedActiveGateDetails.activeGateBlockerHistory) ?
      cloneJsonValue(selectedActiveGateDetails.activeGateBlockerHistory) :
      null;
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
  const nodeDiagnostics = Array.isArray(selectedActiveGateDetails.nodeDiagnostics) ?
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
    activeGateProgress,
    activeGateBestProgress,
    activeGateAdmissionState,
    activeGateNoProgress,
    activeGateBlockerHistory,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryInvariants,
    readinessByNodeId: Object.keys(readinessByNodeId).length > ZERO ?
      readinessByNodeId :
      null,
    activeGateObservedAtMs: selectedActiveGateTimestampMs,
    activeGateObservedAt: toIsoTimestamp(selectedActiveGateTimestampMs),
  };

  const selectedSnapshotNodeId = String(
    snapshotCoverage?.selectedNodeId || '',
  ).trim();
  const selectedCapturedAtMs = normalizeNonNegativeCount(
    snapshotCoverage?.selectedCapturedAtMs,
  );
  const observedNodeIds = Array.isArray(snapshotCoverage?.selectedObservedNodeIds) ?
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

function buildRestartBoundariesFromPlaybackEvents(events) {
  const restartBoundariesByNodeId = {};
  for (const event of Array.isArray(events) ? events : []) {
    if (!isRecord(event) ||
        event.type !== PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY) {
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
      phase: typeof event?.details?.phase === 'string' ?
        event.details.phase :
        UNKNOWN_VALUE,
      snapshot: isRecord(event?.details?.snapshot) ?
        event.details.snapshot :
        null,
      error: typeof event?.details?.error === 'string' ?
        event.details.error :
        null,
    });
  }
  return Object.keys(restartBoundariesByNodeId).length > ZERO ?
    restartBoundariesByNodeId :
    null;
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
      controlPlaneFallback:
        controlPlaneFallback?.controlPlaneFallback || null,
      controlSnapshotByNodeId:
        controlPlaneFallback?.controlSnapshotByNodeId || null,
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
  const diagnostics = resolveFailureDiagnostics(entry);
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
  const directDiagnostics = directDiagnosticsFromEntry ||
    directDiagnosticsFromRootCause ||
    (isRecord(diagnostics?.controlPlaneDiagnostics) ?
      diagnostics.controlPlaneDiagnostics :
      null);
  const directDiagnosticSnapshotNodeIdCandidate = String(
    diagnostics?.snapshotNodeId ||
    directDiagnostics?.snapshotNodeId ||
    '',
  ).trim();
  const directDiagnosticSnapshotNodeId =
    directDiagnosticSnapshotNodeIdCandidate.length > ZERO ?
      directDiagnosticSnapshotNodeIdCandidate :
      UNKNOWN_VALUE;
  const directDiagnosticSources = directDiagnostics ? {
    [directDiagnosticSnapshotNodeId]: {
      controlPlaneDiagnostics: directDiagnostics,
    },
  } : null;
  const publicationModeByNodeId = {};
  const heartbeatPublicationByNodeId = {};
  let publicationConvergence =
    directDiagnostics?.publicationConvergence &&
      typeof directDiagnostics.publicationConvergence === 'object' ?
      directDiagnostics.publicationConvergence :
      null;
  let priorityRecoveryDecisionSnapshots =
    normalizePriorityRecoveryDecisionSnapshots(
      directDiagnostics?.priorityRecoveryDecisionSnapshots,
    );
  let priorityRecoveryInvariants =
    normalizePriorityRecoveryInvariants(
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
      typeof directDiagnostics.startupRecovery === 'object' ?
      directDiagnostics.startupRecovery :
      null;

  const diagnosticSources =
    directLedgerSnapshotsByNodeId && Object.keys(directLedgerSnapshotsByNodeId).length > ZERO ?
      directLedgerSnapshotsByNodeId :
      (snapshotsByNodeId && Object.keys(snapshotsByNodeId).length > ZERO ?
        snapshotsByNodeId :
        directDiagnosticSources);

  if (diagnosticSources && typeof diagnosticSources === 'object') {
    for (const [snapshotNodeId, snapshot] of Object.entries(diagnosticSources)) {
      const controlPlaneDiagnostics =
        snapshot?.controlPlaneDiagnostics &&
          typeof snapshot.controlPlaneDiagnostics === 'object' ?
          snapshot.controlPlaneDiagnostics :
          null;
      if (!controlPlaneDiagnostics) {
        continue;
      }

      if (controlPlaneDiagnostics.publicationMode &&
          typeof controlPlaneDiagnostics.publicationMode === 'object') {
        publicationModeByNodeId[snapshotNodeId] =
          controlPlaneDiagnostics.publicationMode;
      }
      if (!publicationConvergence &&
          controlPlaneDiagnostics.publicationConvergence &&
          typeof controlPlaneDiagnostics.publicationConvergence === 'object') {
        publicationConvergence =
          controlPlaneDiagnostics.publicationConvergence;
      }
      priorityRecoveryDecisionSnapshots =
        mergePriorityRecoveryDecisionSnapshots(
          priorityRecoveryDecisionSnapshots,
          controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots,
        );
      priorityRecoveryInvariants =
        mergePriorityRecoveryInvariants(
          priorityRecoveryInvariants,
          controlPlaneDiagnostics.priorityRecoveryInvariants,
        );
      if (controlPlaneDiagnostics.heartbeatPublication &&
          typeof controlPlaneDiagnostics.heartbeatPublication === 'object') {
        heartbeatPublicationByNodeId[snapshotNodeId] =
          controlPlaneDiagnostics.heartbeatPublication;
      }
      if (!startupRecovery &&
          controlPlaneDiagnostics.startupRecovery &&
          typeof controlPlaneDiagnostics.startupRecovery === 'object') {
        startupRecovery = controlPlaneDiagnostics.startupRecovery;
      }

      const readiness = controlPlaneDiagnostics.readinessByNodeId &&
        typeof controlPlaneDiagnostics.readinessByNodeId === 'object' ?
        controlPlaneDiagnostics.readinessByNodeId :
        {};
      Object.assign(readinessByNodeId, readiness);

      const nodeLiveness = controlPlaneDiagnostics.nodeLivenessByNodeId &&
        typeof controlPlaneDiagnostics.nodeLivenessByNodeId === 'object' ?
        controlPlaneDiagnostics.nodeLivenessByNodeId :
        {};
      Object.assign(nodeLivenessByNodeId, nodeLiveness);

      const readinessTransitions =
        controlPlaneDiagnostics.readinessTransitionsByNodeId &&
        typeof controlPlaneDiagnostics.readinessTransitionsByNodeId === 'object' ?
          controlPlaneDiagnostics.readinessTransitionsByNodeId :
          {};
      for (const [nodeId, transitions] of Object.entries(readinessTransitions)) {
        const existing =
          readinessTransitionsByNodeId[nodeId] || [];
        readinessTransitionsByNodeId[nodeId] =
          mergeTransitionHistory(existing, transitions);
      }

      const placement = controlPlaneDiagnostics.placementEligibilityByNodeId &&
        typeof controlPlaneDiagnostics.placementEligibilityByNodeId === 'object' ?
        controlPlaneDiagnostics.placementEligibilityByNodeId :
        {};
      Object.assign(placementEligibilityByNodeId, placement);

      const workflows =
        controlPlaneDiagnostics.workflowAdmissionsByWorkflowId &&
        typeof controlPlaneDiagnostics.workflowAdmissionsByWorkflowId === 'object' ?
          controlPlaneDiagnostics.workflowAdmissionsByWorkflowId :
          {};
      Object.assign(workflowAdmissionsByWorkflowId, workflows);

      const timeouts = Array.isArray(controlPlaneDiagnostics.timeoutClassifications) ?
        controlPlaneDiagnostics.timeoutClassifications :
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

      const decisions = Array.isArray(controlPlaneDiagnostics.participationDecisions) ?
        controlPlaneDiagnostics.participationDecisions :
        [];
      for (const decision of decisions) {
        if (!decision || typeof decision !== 'object') {
          continue;
        }
        participationDecisions.push({
          snapshotNodeId,
          ...decision,
        });
      }

      const repairs =
        Array.isArray(controlPlaneDiagnostics.authoritativeReadinessRepairs) ?
          controlPlaneDiagnostics.authoritativeReadinessRepairs :
          [];
      for (const repair of repairs) {
        if (!repair || typeof repair !== 'object') {
          continue;
        }
        authoritativeReadinessRepairs.push({
          snapshotNodeId,
          ...repair,
        });
      }

      const recoveryEpochs = controlPlaneDiagnostics.recoveryEpochsByNodeId &&
        typeof controlPlaneDiagnostics.recoveryEpochsByNodeId === 'object' ?
        controlPlaneDiagnostics.recoveryEpochsByNodeId :
        {};
      for (const [nodeId, epochs] of Object.entries(recoveryEpochs)) {
        const existing = Array.isArray(recoveryEpochsByNodeId[nodeId]) ?
          recoveryEpochsByNodeId[nodeId] :
          [];
        recoveryEpochsByNodeId[nodeId] = [
          ...existing,
          ...(Array.isArray(epochs) ? epochs.map((epoch) => ({
            snapshotNodeId,
            ...epoch,
          })) : []),
        ];
      }

      const operations = Array.isArray(controlPlaneDiagnostics.controlPlaneOperations) ?
        controlPlaneDiagnostics.controlPlaneOperations :
        [];
      for (const operation of operations) {
        if (!operation || typeof operation !== 'object') {
          continue;
        }
        controlPlaneOperations.push({
          snapshotNodeId,
          ...operation,
        });
      }
    }
  }

  if (Object.keys(publicationModeByNodeId).length === ZERO &&
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
      priorityRecoveryDecisionSnapshots === null &&
      priorityRecoveryInvariants === null &&
      directDiagnostics === null) {
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
      const decisionArtifacts = extractDecisionArtifactsFromLogContent(content);
      if (decisionArtifacts) {
        result.decisionArtifactsByNodeId[nodeId] = decisionArtifacts;
      }
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
    result.playbackEventSummary = playbackInsights.playbackEventSummary || null;
    result.firstFaultTimeline = playbackInsights.firstFaultTimeline || null;
    result.playbackReadiness = playbackInsights.readiness || null;
    result.restartBoundariesByNodeId =
      playbackInsights.restartBoundariesByNodeId || null;
    result.playbackControlPlane =
      playbackInsights.controlPlaneFallback || null;
    result.playbackControlSnapshotByNodeId =
      playbackInsights.controlSnapshotByNodeId || null;
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

function mergeControlPlaneDiagnostics(primary, fallback) {
  const hasPrimary = isRecord(primary);
  const hasFallback = isRecord(fallback);
  if (!hasPrimary && !hasFallback) {
    return null;
  }
  if (!hasPrimary) {
    return {
      ...fallback,
      priorityRecoveryDecisionSnapshots:
        normalizePriorityRecoveryDecisionSnapshots(
          fallback?.priorityRecoveryDecisionSnapshots,
        ),
      priorityRecoveryInvariants: normalizePriorityRecoveryInvariants(
        fallback?.priorityRecoveryInvariants,
      ),
    };
  }
  if (!hasFallback) {
    return {
      ...primary,
      priorityRecoveryDecisionSnapshots:
        normalizePriorityRecoveryDecisionSnapshots(
          primary?.priorityRecoveryDecisionSnapshots,
        ),
      priorityRecoveryInvariants: normalizePriorityRecoveryInvariants(
        primary?.priorityRecoveryInvariants,
      ),
    };
  }

  return {
    ...fallback,
    ...primary,
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
    activeGateProgress:
      primary.activeGateProgress ||
      fallback.activeGateProgress ||
      null,
    activeGateBestProgress:
      primary.activeGateBestProgress ||
      fallback.activeGateBestProgress ||
      null,
    activeGateNoProgress:
      primary.activeGateNoProgress ||
      fallback.activeGateNoProgress ||
      null,
    activeGateBlockerHistory:
      primary.activeGateBlockerHistory ||
      fallback.activeGateBlockerHistory ||
      null,
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
  };
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
  const controlSnapshotByNodeId = isRecord(mergedControlSnapshotByNodeId) ?
    mergedControlSnapshotByNodeId :
    (resolveControlSnapshot(entry) || {});
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
      controlPlaneDiagnostics.participationDecisions.filter((entry) =>
        entry?.nodeId === nodeId,
      ) :
      [];
    const authoritativeReadinessRepairs = Array.isArray(
      controlPlaneDiagnostics?.authoritativeReadinessRepairs,
    ) ?
      controlPlaneDiagnostics.authoritativeReadinessRepairs.filter((entry) =>
        entry?.nodeId === nodeId,
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
      controlPlaneDiagnostics.controlPlaneOperations.filter((entry) =>
        entry?.nodeId === nodeId,
      ) :
      [];
    const timelineCorrelation =
      timelineCorrelationByNodeId?.[nodeId] || null;
    const nodeLogPath = logs?.nodeLogPaths?.[nodeId] || null;
    const logExcerpt = Array.isArray(logs?.excerptsByNodeId?.[nodeId]) ?
      logs.excerptsByNodeId[nodeId] :
      [];
    const decisionArtifacts =
      logs?.decisionArtifactsByNodeId?.[nodeId] || null;
    const restartBoundaries = Array.isArray(logs?.restartBoundariesByNodeId?.[nodeId]) ?
      logs.restartBoundariesByNodeId[nodeId] :
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
        participationDecisions.length === ZERO &&
        authoritativeReadinessRepairs.length === ZERO &&
        recoveryEpochs.length === ZERO &&
        controlPlaneOperations.length === ZERO &&
        !timelineCorrelation &&
        !decisionArtifacts &&
        restartBoundaries.length === ZERO &&
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

function buildPublicationConvergenceSummary(controlPlane) {
  const publicationConvergence =
    controlPlane?.publicationConvergence &&
      typeof controlPlane.publicationConvergence === 'object' ?
      controlPlane.publicationConvergence :
      null;
  const publicationConvergenceGate =
    controlPlane?.publicationConvergenceGate &&
      typeof controlPlane.publicationConvergenceGate === 'object' ?
      controlPlane.publicationConvergenceGate :
      null;
  const priorityRecoveryDecisionSnapshotSummary =
    summarizePriorityRecoveryDecisionSnapshots(
      controlPlane?.priorityRecoveryDecisionSnapshots,
    );
  const priorityRecoveryInvariants = normalizePriorityRecoveryInvariants(
    controlPlane?.priorityRecoveryInvariants,
  );
  const hasActiveGatePublicationEvidence =
    (
      controlPlane?.publicationConvergenceGate &&
      typeof controlPlane.publicationConvergenceGate === 'object'
    ) ||
    (
      controlPlane?.activeGateProgress &&
      typeof controlPlane.activeGateProgress === 'object'
    ) ||
    (
      controlPlane?.activeGateBestProgress &&
      typeof controlPlane.activeGateBestProgress === 'object'
    ) ||
    (
      controlPlane?.activeGateNoProgress &&
      typeof controlPlane.activeGateNoProgress === 'object'
    );
  if (!publicationConvergence &&
      !priorityRecoveryDecisionSnapshotSummary &&
      !priorityRecoveryInvariants &&
      !hasActiveGatePublicationEvidence) {
    return null;
  }
  const pendingAckNodeIds = Array.isArray(publicationConvergence?.pendingAckNodeIds) ?
    publicationConvergence.pendingAckNodeIds :
    [];
  const blockedNodeIds = [];
  const blockingReasonCounts = {};
  for (const [nodeId, readiness] of Object.entries(
    controlPlane?.readinessByNodeId || {},
  )) {
    const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
    const reasonCodes = reasons
      .map((reason) => String(reason?.code || '').trim())
      .filter((reason) => reason.length > ZERO);
    const publicationReasons = reasonCodes.filter((reason) =>
      reason === 'control_plane_publication_pending' ||
      reason === 'publishedConvergencePending' ||
      reason === 'recovery_eligibility_pending',
    );
    if (publicationReasons.length === ZERO) {
      continue;
    }
    blockedNodeIds.push(nodeId);
    for (const reason of publicationReasons) {
      blockingReasonCounts[reason] = (blockingReasonCounts[reason] || ZERO) + 1;
    }
  }
  const gateReasons = Array.isArray(publicationConvergenceGate?.reasons) ?
    publicationConvergenceGate.reasons
      .map((reason) => String(reason || '').trim())
      .filter((reason) => reason.length > ZERO) :
    [];
  const recoveryProtocolState =
    typeof publicationConvergence?.recoveryProtocolState === 'string' ?
      publicationConvergence.recoveryProtocolState :
      (typeof publicationConvergence?.membershipLifecycleSummary
        ?.recoveryProtocolState === 'string' ?
        publicationConvergence.membershipLifecycleSummary
          .recoveryProtocolState :
        null);
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    Array.isArray(publicationConvergence?.priorityRecoveryReasonCodes) ?
      publicationConvergence.priorityRecoveryReasonCodes :
      publicationConvergence?.membershipLifecycleSummary
        ?.recoveryProtocolReasonCodes,
  );
  const priorityPartitionSummary = publicationConvergence?.priorityPartitionSummary &&
    typeof publicationConvergence.priorityPartitionSummary === 'object' ?
    publicationConvergence.priorityPartitionSummary :
    (publicationConvergenceGate?.priorityPartitionSummary &&
    typeof publicationConvergenceGate.priorityPartitionSummary === 'object' ?
      publicationConvergenceGate.priorityPartitionSummary :
      null);
  const prioritySpreadPending = gateReasons.includes(
    'priority_control_plane_spread_pending',
  ) || priorityRecoveryReasonCodes.includes(
    'priority_partitions_not_spread',
  ) || recoveryProtocolState === 'priority_spread_pending' || (
    priorityPartitionSummary &&
    priorityPartitionSummary.satisfied === false
  );
  const publicationPending = priorityRecoveryReasonCodes.includes(
    'publication_epoch_pending',
  ) || (
    recoveryProtocolState === 'publication_pending'
  );
  const membershipProjectionDiagnostics =
    publicationConvergence?.membershipLifecycleSummary?.projectionDiagnostics &&
      typeof publicationConvergence.membershipLifecycleSummary
        .projectionDiagnostics === 'object' ?
      publicationConvergence.membershipLifecycleSummary
        .projectionDiagnostics :
      null;
  const projectionDiagnosticsSource =
    publicationConvergence?.projectionDiagnostics &&
      typeof publicationConvergence.projectionDiagnostics === 'object' ?
      publicationConvergence.projectionDiagnostics :
      membershipProjectionDiagnostics;
  const projectionDiagnostics = projectionDiagnosticsSource ? {
    readinessDecisionMode:
      typeof projectionDiagnosticsSource.readinessDecisionMode === 'string' ?
        projectionDiagnosticsSource.readinessDecisionMode :
        null,
    readinessDecisionDimensions: Array.isArray(
      projectionDiagnosticsSource.readinessDecisionDimensions,
    ) ?
      projectionDiagnosticsSource.readinessDecisionDimensions :
      [],
    recoveryEligibleProjectionEnabled:
      projectionDiagnosticsSource.recoveryEligibleProjectionEnabled === true,
    recoveryEligibleIncludedNodeIds: Array.isArray(
      projectionDiagnosticsSource.recoveryEligibleIncludedNodeIds,
    ) ?
      projectionDiagnosticsSource.recoveryEligibleIncludedNodeIds :
      [],
    readinessExcludedNodeIds: Array.isArray(
      projectionDiagnosticsSource.readinessExcludedNodeIds,
    ) ?
      projectionDiagnosticsSource.readinessExcludedNodeIds :
      [],
    clusterMemberUnhealthyExcludedNodeIds: Array.isArray(
      projectionDiagnosticsSource.clusterMemberUnhealthyExcludedNodeIds,
    ) ?
      projectionDiagnosticsSource.clusterMemberUnhealthyExcludedNodeIds :
      [],
  } : null;
  const activeGateProgress =
    controlPlane?.activeGateProgress &&
      typeof controlPlane.activeGateProgress === 'object' ?
      controlPlane.activeGateProgress :
      null;
  const activeGateSnapshotCoverage =
    controlPlane?.activeGateSnapshotCoverage &&
      typeof controlPlane.activeGateSnapshotCoverage === 'object' ?
      controlPlane.activeGateSnapshotCoverage :
      null;
  const activeGateBestProgress =
    controlPlane?.activeGateBestProgress &&
      typeof controlPlane.activeGateBestProgress === 'object' ?
      controlPlane.activeGateBestProgress :
      null;
  const activeGateNoProgress =
    controlPlane?.activeGateNoProgress &&
      typeof controlPlane.activeGateNoProgress === 'object' ?
      controlPlane.activeGateNoProgress :
      null;
  const activeGateReadinessDelay = normalizeActiveGateReadinessDelay(
    activeGateNoProgress?.readinessDelay ||
      activeGateProgress?.readinessDelay ||
      activeGateBestProgress?.readinessDelay ||
      activeGateNoProgress?.currentProgress?.readinessDelay ||
      null,
  );
  const activeGateBlockerHistory =
    Array.isArray(controlPlane?.activeGateBlockerHistory) ?
      controlPlane.activeGateBlockerHistory :
      [];
  const priorityRecoveryInvariantFailures = Array.isArray(
    priorityRecoveryInvariants?.invariants,
  ) ?
    priorityRecoveryInvariants.invariants
      .filter((invariant) => invariant?.passed !== true)
      .map((invariant) => ({
        id: String(invariant?.id || PRIORITY_RECOVERY_INVARIANT_FALLBACK),
        invariantId:
          String(
            invariant?.invariantId ||
            invariant?.id ||
            PRIORITY_RECOVERY_INVARIANT_FALLBACK,
          ),
        reasonCode:
          String(
            invariant?.reasonCode ||
            invariant?.code ||
            PRIORITY_RECOVERY_INVARIANT_FALLBACK,
          ),
        severity: typeof invariant?.severity === 'string' ?
          invariant.severity :
          null,
        scope: typeof invariant?.scope === 'string' ?
          invariant.scope :
          null,
        owningSubsystem:
          typeof invariant?.owningSubsystem === 'string' ?
            invariant.owningSubsystem :
            null,
        details: isRecord(invariant?.details) ? invariant.details : null,
      })) :
    [];
  const closureProgressSnapshot =
    activeGateProgress ||
    activeGateBestProgress ||
    activeGateNoProgress?.currentProgress ||
    (activeGateSnapshotCoverage ? {
      snapshotCoverageComplete: activeGateSnapshotCoverage.completeCoverage === true,
      publicationStatus:
        publicationConvergence?.publicationStatus ||
        publicationConvergenceGate?.publicationStatus ||
        activeGateSnapshotCoverage?.selectedPublicationConvergence?.publicationStatus ||
        activeGateSnapshotCoverage?.selectedPublishedMembershipObservation
          ?.publicationStatus ||
        null,
      pendingAckCount: Array.isArray(publicationConvergence?.pendingAckNodeIds) ?
        publicationConvergence.pendingAckNodeIds.length :
        (Array.isArray(publicationConvergenceGate?.pendingAckNodeIds) ?
          publicationConvergenceGate.pendingAckNodeIds.length :
          ZERO),
      missingPublishedCount: Array.isArray(
        publicationConvergenceGate?.missingPublishedNodeIds,
      ) ? publicationConvergenceGate.missingPublishedNodeIds.length : ZERO,
      recoveryProtocolState,
      priorityRecoveryReasonCodes,
      gateReasons,
      prioritySpreadSatisfied:
        priorityPartitionSummary?.satisfied === true ?
          true :
          (priorityPartitionSummary?.satisfied === false ? false : null),
    } : null);
  const activeGateClosureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: closureProgressSnapshot,
    publicationConvergence,
    publicationConvergenceGate,
    readinessMode: activeGateNoProgress?.mode || null,
  });
  return {
    publicationEpoch: publicationConvergence?.publicationEpoch ?? null,
    publicationStatus: publicationConvergence?.publicationStatus || null,
    pendingAckNodeIds,
    pendingAckCount: pendingAckNodeIds.length,
    blockedNodeIds,
    blockedNodeCount: blockedNodeIds.length,
    blockingReasonCounts,
    publishedActiveNodeIds: Array.isArray(
      publicationConvergence?.publishedActiveNodeIds,
    ) ? publicationConvergence.publishedActiveNodeIds : [],
    publishedAt: publicationConvergence?.publishedAt || null,
    updatedAt: publicationConvergence?.updatedAt || null,
    recoveryProtocolState,
    priorityRecoveryReasonCodes,
    publicationPending,
    prioritySpreadPending,
    publicationConvergenceGateReasons: gateReasons,
    activeGateProgress,
    activeGateBestProgress,
    activeGateNoProgress,
    activeGateReadinessDelay,
    activeGateBlockerHistory,
    closureRecordId: activeGateProgress?.closureRecordId ||
      activeGateBestProgress?.closureRecordId ||
      activeGateNoProgress?.closureRecordId ||
      activeGateClosureWitness?.closureRecordId ||
      null,
    closureWitnessClass: activeGateProgress?.closureWitnessClass ||
      activeGateBestProgress?.closureWitnessClass ||
      activeGateNoProgress?.closureWitnessClass ||
      activeGateClosureWitness?.closureWitnessClass ||
      null,
    projectionDiagnostics,
    priorityPartitionSummary: priorityPartitionSummary ?
      {
        satisfied: priorityPartitionSummary.satisfied === true,
        requiredDistinctNodeCount:
          Number(priorityPartitionSummary.requiredDistinctNodeCount || ZERO),
        readyEligibleNodeCount:
          Number(priorityPartitionSummary.readyEligibleNodeCount || ZERO),
        totalPriorityPartitionCount:
          Number(priorityPartitionSummary.totalPriorityPartitionCount || ZERO),
        missingPartitionIds: Array.isArray(priorityPartitionSummary.missingPartitionIds) ?
          priorityPartitionSummary.missingPartitionIds :
          [],
        blockedPartitionCount:
          Number(priorityPartitionSummary.blockedPartitionCount || ZERO),
        largestSpreadGap: Number(priorityPartitionSummary.largestSpreadGap || ZERO),
        totalSpreadGap: Number(priorityPartitionSummary.totalSpreadGap || ZERO),
      } :
      null,
    priorityRecoveryProgressClassIds:
      priorityRecoveryDecisionSnapshotSummary?.unresolvedClassIds || [],
    priorityRecoveryProgressClassCount:
      priorityRecoveryDecisionSnapshotSummary?.unresolvedClassCount || ZERO,
    priorityRecoverySemanticStateIds:
      priorityRecoveryDecisionSnapshotSummary?.unresolvedSemanticStateIds || [],
    priorityRecoverySemanticStateCount:
      priorityRecoveryDecisionSnapshotSummary?.unresolvedSemanticStateCount || ZERO,
    priorityRecoveryBlockedPartitionIds:
      priorityRecoveryDecisionSnapshotSummary?.blockedPartitionIds || [],
    priorityRecoveryBlockedPartitionCount:
      priorityRecoveryDecisionSnapshotSummary?.blockedPartitionCount || ZERO,
    priorityRecoveryBlockerPartitionIdsByReason:
      priorityRecoveryDecisionSnapshotSummary?.blockerPartitionIdsByReason || {},
    priorityRecoveryPartitionIdsBySemanticState:
      priorityRecoveryDecisionSnapshotSummary?.partitionIdsBySemanticState || {},
    priorityRecoveryPartitionBlockerHistory:
      priorityRecoveryDecisionSnapshotSummary?.partitionBlockerHistory || [],
    priorityRecoveryPartitionSemanticStateHistory:
      priorityRecoveryDecisionSnapshotSummary?.partitionSemanticStateHistory || [],
    priorityRecoveryPartitionWitnesses:
      priorityRecoveryDecisionSnapshotSummary?.partitionWitnesses || [],
    priorityRecoveryAdmissionDecisionDimensions:
      priorityRecoveryDecisionSnapshotSummary?.admissionDecisionDimensions || [],
    priorityRecoveryInvariantFailingIds:
      priorityRecoveryInvariants?.failingInvariantIds || [],
    priorityRecoveryInvariantFailures,
    priorityRecoveryInvariantCount:
      Array.isArray(priorityRecoveryInvariants?.invariants) ?
        priorityRecoveryInvariants.invariants.length :
        ZERO,
  };
}

function collectReadinessReasonCodes(readinessSnapshot) {
  const reasons = Array.isArray(readinessSnapshot?.reasons) ?
    readinessSnapshot.reasons :
    [];
  return reasons
    .map((reason) => String(reason?.code || '').trim())
    .filter((reason) => reason.length > ZERO);
}

function buildRecoveryReadinessSummary({
  controlPlane = null,
  nodeDiagnostics = null,
} = {}) {
  const routingDimensionCounts = {};
  const repairRoutedNodeIds = [];
  const recoveryRoutedNodeIds = [];
  for (const [nodeId, nodeDiagnostic] of Object.entries(nodeDiagnostics || {})) {
    const decisionDimension = String(
      nodeDiagnostic?.routingDiagnostics?.routingReadinessDimension || '',
    ).trim();
    if (decisionDimension.length === ZERO) {
      continue;
    }
    routingDimensionCounts[decisionDimension] =
      (routingDimensionCounts[decisionDimension] || ZERO) + 1;
    if (decisionDimension === 'repairEligible') {
      repairRoutedNodeIds.push(nodeId);
    } else if (decisionDimension === 'controlPlaneRecoveryEligible') {
      recoveryRoutedNodeIds.push(nodeId);
    }
  }

  const recoveryOnlyNodeIds = [];
  const writeUnhealthyNodeIds = [];
  const publicationBlockedNodeIds = [];
  const readinessByNodeId = controlPlane?.readinessByNodeId &&
    typeof controlPlane.readinessByNodeId === 'object' ?
    controlPlane.readinessByNodeId :
    {};

  for (const [nodeId, readiness] of Object.entries(readinessByNodeId)) {
    const dimensions = readiness?.dimensions &&
      typeof readiness.dimensions === 'object' ?
      readiness.dimensions :
      {};
    const repairEligible = dimensions.repairEligible === true;
    const recoveryEligible =
      dimensions.controlPlaneRecoveryEligible === true;
    if (recoveryEligible && !repairEligible) {
      recoveryOnlyNodeIds.push(nodeId);
    }

    const reasonCodes = collectReadinessReasonCodes(readiness);
    if (reasonCodes.includes('control_plane_write_unhealthy')) {
      writeUnhealthyNodeIds.push(nodeId);
    }
    if (reasonCodes.includes('control_plane_publication_pending') ||
        reasonCodes.includes('publishedConvergencePending') ||
        reasonCodes.includes('recovery_eligibility_pending')) {
      publicationBlockedNodeIds.push(nodeId);
    }
  }

  const recoveryOnlyNodeIdSet = new Set(recoveryOnlyNodeIds);
  const repairRoutedRecoveryOnlyNodeIds = repairRoutedNodeIds
    .filter((nodeId) => recoveryOnlyNodeIdSet.has(nodeId));
  const publicationConvergence = controlPlane?.publicationConvergence &&
    typeof controlPlane.publicationConvergence === 'object' ?
    controlPlane.publicationConvergence :
    null;
  const pendingAckNodeIds = Array.isArray(publicationConvergence?.pendingAckNodeIds) ?
    publicationConvergence.pendingAckNodeIds :
    [];
  const pendingAckRecoveryOnlyNodeIds = [];
  const pendingAckRepairEligibleNodeIds = [];
  const pendingAckBlockedNodeIds = [];
  for (const nodeId of pendingAckNodeIds) {
    const readiness = readinessByNodeId[nodeId];
    if (!readiness || typeof readiness !== 'object') {
      pendingAckBlockedNodeIds.push(nodeId);
      continue;
    }
    const dimensions = readiness.dimensions &&
      typeof readiness.dimensions === 'object' ?
      readiness.dimensions :
      {};
    const repairEligible = dimensions.repairEligible === true;
    const recoveryEligible =
      dimensions.controlPlaneRecoveryEligible === true;
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

  if (Object.keys(routingDimensionCounts).length === ZERO &&
      recoveryOnlyNodeIds.length === ZERO &&
      writeUnhealthyNodeIds.length === ZERO &&
      publicationBlockedNodeIds.length === ZERO &&
      pendingAckNodeIds.length === ZERO) {
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

function buildFailureClassification({
  failure,
  controlPlane,
  readiness,
  logs,
}) {
  const signals = [];
  const dominantReason = String(failure?.dominantReason || '').trim();
  const rootCauseClass = String(failure?.rootCauseClass || '').trim();
  const publicationConvergence = buildPublicationConvergenceSummary(controlPlane);
  const readinessFailure = resolveReadinessFailure(controlPlane);
  const startupRecovery =
    controlPlane?.startupRecovery &&
      typeof controlPlane.startupRecovery === 'object' ?
      controlPlane.startupRecovery :
      null;
  const latestStartupDecision = Object.values(logs?.decisionArtifactsByNodeId || {})
    .map((artifact) => artifact?.latestStartupDecision || null)
    .filter(Boolean)
    .slice(-1)[ZERO] || null;
  const hasStartupReadinessBlocker =
    readinessFailure?.mode === STARTUP_READINESS_MODE_STARTUP;

  if (publicationConvergence &&
      (publicationConvergence.pendingAckCount > ZERO ||
        publicationConvergence.blockedNodeCount > ZERO ||
        publicationConvergence.prioritySpreadPending === true ||
        hasStartupReadinessBlocker)) {
    appendActiveGateReadinessDelaySignals(
      signals,
      publicationConvergence.activeGateReadinessDelay,
    );
    appendReadinessFailureSignals(signals, readinessFailure);
    signals.push(
      'pendingAckCount=' + publicationConvergence.pendingAckCount,
      'blockedNodeCount=' + publicationConvergence.blockedNodeCount,
    );
    if (typeof publicationConvergence.recoveryProtocolState === 'string' &&
        publicationConvergence.recoveryProtocolState.length > ZERO) {
      signals.push(
        'recoveryProtocolState=' +
        publicationConvergence.recoveryProtocolState,
      );
    }
    if (publicationConvergence.prioritySpreadPending === true) {
      signals.push('prioritySpreadPending=true');
    }
    if (Number(publicationConvergence.priorityRecoveryProgressClassCount) > ZERO) {
      signals.push(
        'priorityRecoveryProgressClassCount=' +
        String(publicationConvergence.priorityRecoveryProgressClassCount),
      );
    }
    if (Array.isArray(publicationConvergence.priorityRecoveryInvariantFailingIds) &&
        publicationConvergence.priorityRecoveryInvariantFailingIds.length > ZERO) {
      signals.push(
        'priorityRecoveryFailingInvariants=' +
        publicationConvergence.priorityRecoveryInvariantFailingIds.join('|'),
      );
    }
    if (typeof publicationConvergence.closureRecordId === 'string' &&
        publicationConvergence.closureRecordId.length > ZERO) {
      signals.push(
        'closureRecordId=' + publicationConvergence.closureRecordId,
      );
    }
    if (typeof publicationConvergence.closureWitnessClass === 'string' &&
        publicationConvergence.closureWitnessClass.length > ZERO) {
      signals.push(
        'closureWitnessClass=' + publicationConvergence.closureWitnessClass,
      );
    }
    return {
      failureClass: FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      confidence: FAILURE_CLASS_CONFIDENCE_HIGH,
      rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_UNKNOWN,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (startupRecovery?.recoveryBlocked === true ||
      rootCauseClass === ROOT_CAUSE_CLASS_STARTUP) {
    if (startupRecovery?.recoveryStage) {
      signals.push('recoveryStage=' + startupRecovery.recoveryStage);
    }
    if (latestStartupDecision?.startupMode) {
      signals.push('startupMode=' + latestStartupDecision.startupMode);
    }
    return {
      failureClass: FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      confidence: startupRecovery?.recoveryBlocked === true ?
        FAILURE_CLASS_CONFIDENCE_HIGH :
        FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_STARTUP,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === ROOT_CAUSE_CLASS_DISCOVERY) {
    return {
      failureClass: FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === ROOT_CAUSE_CLASS_TOPOLOGY) {
    return {
      failureClass: FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === ROOT_CAUSE_CLASS_LOAD) {
    return {
      failureClass: FAILURE_CLASS_LOAD_PRESSURE,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === ROOT_CAUSE_CLASS_CDC || dominantReason.includes('cdc')) {
    return {
      failureClass: FAILURE_CLASS_CDC_DEGRADED,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_CDC,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === ROOT_CAUSE_CLASS_CACHE || dominantReason.includes('cache')) {
    return {
      failureClass: FAILURE_CLASS_CACHE_STALE,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_CACHE,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  if (rootCauseClass === 'verify') {
    return {
      failureClass: FAILURE_CLASS_VERIFICATION_MISMATCH,
      confidence: FAILURE_CLASS_CONFIDENCE_MEDIUM,
      rootCauseClass,
      dominantReason: dominantReason || null,
      signals,
    };
  }

  const readinessReasons = Object.values(readiness?.nodeReasonsByNodeId || {})
    .flatMap((reasons) => Array.isArray(reasons) ? reasons : []);
  if (readinessReasons.length > ZERO) {
    signals.push('readinessReasons=' + readinessReasons.slice(ZERO, 3).join('|'));
  }

  return {
    failureClass: FAILURE_CLASS_UNKNOWN,
    confidence: FAILURE_CLASS_CONFIDENCE_LOW,
    rootCauseClass: rootCauseClass || ROOT_CAUSE_CLASS_UNKNOWN,
    dominantReason: dominantReason || null,
    signals,
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
  const controlPlane = mergeControlPlaneDiagnostics(
    resolveControlPlaneDiagnostics(entry),
    logs?.playbackControlPlane || null,
  );
  const controlSnapshotByNodeId = mergeControlSnapshotByNodeId(
    resolveControlSnapshot(entry),
    logs?.playbackControlSnapshotByNodeId || null,
  );
  const readiness = resolveReadinessSnapshot(
    entry,
    logs?.playbackReadiness || null,
  );
  const firstFaultTimeline = resolveFirstFaultTimeline(
    entry,
    logs?.firstFaultTimeline || null,
  );
  const readinessFailure = resolveReadinessFailure(controlPlane);
  const readinessFailureGuidance = resolveReadinessFailureGuidance(
    readinessFailure,
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
  const publicationConvergence = buildPublicationConvergenceSummary(controlPlane);
  const failureClassification = buildFailureClassification({
    failure,
    controlPlane,
    readiness,
    logs,
  });
  const timelineCorrelationByNodeId = buildTimelineCorrelationByNodeId(
    entry,
    controlPlane,
  );
  const nodeDiagnostics = buildFocusedNodeDiagnostics(
    entry,
    logs,
    controlPlane,
    controlSnapshotByNodeId,
    timelineCorrelationByNodeId,
  );
  const recoveryReadiness = buildRecoveryReadinessSummary({
    controlPlane,
    nodeDiagnostics,
  });
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
      failureClassification,
      readinessFailure,
      failureAction: readinessFailureGuidance.failureAction,
      operatorRecommendation:
        readinessFailureGuidance.operatorRecommendation,
      publicationConvergence,
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
      controlPlaneDiagnostics:
        diagnostics.controlPlaneDiagnostics ||
        controlPlane ||
        null,
      priorityRecoveryDecisionSnapshots:
        controlPlane?.priorityRecoveryDecisionSnapshots || null,
      priorityRecoveryInvariants:
        controlPlane?.priorityRecoveryInvariants || null,
      rootCauseBundle: diagnostics.rootCauseBundle || null,
      firstFaultTimeline,
      recoveryReadiness,
    },
    controlSnapshot: controlSnapshotByNodeId,
    controlPlane,
    recoveryReadiness,
    publicationConvergence,
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
    decisionArtifactsByNodeId: logs?.decisionArtifactsByNodeId || {},
    playback: entry.playback || null,
    trace: entry.trace || null,
  };
}

function buildTriageLoadSummary(loadMetrics) {
  if (!isRecord(loadMetrics)) {
    return null;
  }
  const perNodeEntries = Object.entries(
    isRecord(loadMetrics.perNode) ? loadMetrics.perNode : {},
  )
    .map(([nodeId, metrics]) => ({
      nodeId,
      dispatched: normalizeNonNegativeCount(metrics?.dispatched) || ZERO,
      success: normalizeNonNegativeCount(metrics?.success) || ZERO,
      attemptErrors: normalizeNonNegativeCount(metrics?.attemptErrors) || ZERO,
      admissionSignals:
        normalizeNonNegativeCount(metrics?.admissionSignals) || ZERO,
      queuePressureSignals:
        normalizeNonNegativeCount(metrics?.queuePressureSignals) || ZERO,
    }))
    .sort((left, right) => right.attemptErrors - left.attemptErrors)
    .slice(ZERO, TRIAGE_TOP_LOAD_NODE_LIMIT);
  return {
    total: normalizeNonNegativeCount(loadMetrics.total),
    success: normalizeNonNegativeCount(loadMetrics.success),
    failed: normalizeNonNegativeCount(loadMetrics.failed),
    errors: normalizeNonNegativeCount(loadMetrics.errors),
    attemptErrors: normalizeNonNegativeCount(loadMetrics.attemptErrors),
    opsPerSec: Number.isFinite(Number(loadMetrics.opsPerSec)) ?
      Number(loadMetrics.opsPerSec) :
      null,
    dispatchedOperations:
      normalizeNonNegativeCount(loadMetrics.dispatchedOperations),
    undispatchedOperations:
      normalizeNonNegativeCount(loadMetrics.undispatchedOperations),
    waitReasons: isRecord(loadMetrics.waitReasons) ? loadMetrics.waitReasons : {},
    perNodeTopAttemptErrors: perNodeEntries,
  };
}

function resolvePartitioningDiagnosticsForTriage(bundleJson) {
  const artifacts = isRecord(bundleJson?.diagnostics?.failedPhase?.artifacts) ?
    bundleJson.diagnostics.failedPhase.artifacts :
    {};
  const partitionGrowth = isRecord(artifacts.partitionGrowth) ?
    artifacts.partitionGrowth :
    null;
  const planner = isRecord(artifacts.partitioningPlanner) ?
    artifacts.partitioningPlanner :
    null;
  if (!partitionGrowth && !planner) {
    return null;
  }
  return {
    failureMode: typeof partitionGrowth?.failureMode === 'string' ?
      partitionGrowth.failureMode :
      null,
    baselinePartitionCount:
      normalizeNonNegativeCount(partitionGrowth?.baselinePartitionCount),
    currentPartitionCount:
      normalizeNonNegativeCount(partitionGrowth?.currentPartitionCount),
    additionalPartitionCount:
      normalizeNonNegativeCount(partitionGrowth?.additionalPartitionCount),
    replicaNodeCount:
      normalizeNonNegativeCount(partitionGrowth?.replicaNodeCount),
    sampleCount: normalizeNonNegativeCount(partitionGrowth?.sampleCount),
    transientQueryErrors:
      normalizeNonNegativeCount(partitionGrowth?.transientQueryErrors),
    lastQueryError: typeof partitionGrowth?.lastQueryError === 'string' ?
      partitionGrowth.lastQueryError :
      null,
    selectedNodeIds:
      normalizeDistinctStringArray(planner?.selectedNodeIds),
    readyReplicaNodeIds:
      normalizeDistinctStringArray(planner?.readyReplicaNodeIds),
    admissionReadyNodeIds:
      normalizeDistinctStringArray(planner?.admissionReadyNodeIds),
    readinessReasonHistogram:
      isRecord(planner?.readinessReasonHistogram) ?
        planner.readinessReasonHistogram :
        {},
  };
}

function buildRoutingDiagnosticsSummary(nodeDiagnostics) {
  const summaryByNodeId = {};
  for (const [nodeId, diagnostic] of Object.entries(
    isRecord(nodeDiagnostics) ? nodeDiagnostics : {},
  )) {
    const routingDiagnostics = isRecord(diagnostic?.routingDiagnostics) ?
      diagnostic.routingDiagnostics :
      null;
    const timelineCorrelation = isRecord(diagnostic?.timelineCorrelation) ?
      diagnostic.timelineCorrelation :
      null;
    if (!routingDiagnostics && !timelineCorrelation) {
      continue;
    }
    summaryByNodeId[nodeId] = {
      routingDiagnostics,
      timelineCorrelation: timelineCorrelation ? {
        firstLoadFailureAt: timelineCorrelation.firstLoadFailureAt || null,
        firstSplitStartedAt: timelineCorrelation.firstSplitStartedAt || null,
        firstSplitRejectedAt: timelineCorrelation.firstSplitRejectedAt || null,
        firstSplitFailedAt: timelineCorrelation.firstSplitFailedAt || null,
      } : null,
    };
  }
  return Object.keys(summaryByNodeId).length > ZERO ? summaryByNodeId : null;
}

function buildScenarioTriageSummary(bundleJson, links = {}) {
  const readinessFailure =
    bundleJson?.summary?.readinessFailure &&
      typeof bundleJson.summary.readinessFailure === 'object' ?
      bundleJson.summary.readinessFailure :
      null;
  return {
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    scenario: bundleJson?.scenario || UNKNOWN_VALUE,
    summary: {
      error: bundleJson?.summary?.error || null,
      phase: bundleJson?.summary?.phase || null,
      rootCauseClass: bundleJson?.summary?.rootCauseClass || null,
      dominantReason: bundleJson?.summary?.dominantReason || null,
      failureClass:
        bundleJson?.summary?.failureClassification?.failureClass || null,
      failureClassSignals: Array.isArray(
        bundleJson?.summary?.failureClassification?.signals,
      ) ? bundleJson.summary.failureClassification.signals : [],
      readinessFailure,
      failureAction: bundleJson?.summary?.failureAction || null,
      operatorRecommendation:
        bundleJson?.summary?.operatorRecommendation || null,
      bottleneckKind: bundleJson?.summary?.bottleneckEstimate?.kind || null,
      affectedNodeIds:
        normalizeDistinctStringArray(bundleJson?.topFailures?.affectedNodeIds),
      topReasons: Array.isArray(bundleJson?.topFailures?.topReasons) ?
        bundleJson.topFailures.topReasons :
        [],
    },
    artifacts: {
      reportPath: bundleJson?.reportPath || null,
      analysisPath: bundleJson?.logs?.analysisPath || null,
      timelinePath: bundleJson?.logs?.timelinePath || null,
      playbackEventsPath: bundleJson?.logs?.playbackEventsPath || null,
      nodeLogPaths: isRecord(bundleJson?.logs?.nodeLogPaths) ?
        bundleJson.logs.nodeLogPaths :
        {},
      failureBundleJsonPath: links.jsonPath || null,
      failureBundleMarkdownPath: links.markdownPath || null,
    },
    load: buildTriageLoadSummary(bundleJson?.topFailures?.loadMetrics),
    playback: {
      firstFaultTimeline: isRecord(bundleJson?.diagnostics?.firstFaultTimeline) ?
        bundleJson.diagnostics.firstFaultTimeline :
        null,
      eventSummary: isRecord(bundleJson?.logs?.playbackEventSummary) ?
        bundleJson.logs.playbackEventSummary :
        null,
    },
    partitioning: resolvePartitioningDiagnosticsForTriage(bundleJson),
    routingDiagnosticsByNodeId:
      buildRoutingDiagnosticsSummary(bundleJson?.nodeDiagnostics),
    recoveryReadiness: isRecord(bundleJson?.recoveryReadiness) ?
      {
        pendingAckBlockedNodeIds:
          normalizeDistinctStringArray(
            bundleJson.recoveryReadiness.pendingAckBlockedNodeIds,
          ),
        routingDimensionCounts:
          isRecord(bundleJson.recoveryReadiness.routingDimensionCounts) ?
            bundleJson.recoveryReadiness.routingDimensionCounts :
            {},
      } :
      null,
  };
}

function renderScenarioTriageSummaryMarkdown(summary) {
  const lines = [
    '# Scenario Triage Summary',
    '',
    `- Scenario: ${summary?.scenario || UNKNOWN_VALUE}`,
    `- Phase: ${summary?.summary?.phase || UNKNOWN_VALUE}`,
    `- Root Cause Class: ${summary?.summary?.rootCauseClass || UNKNOWN_VALUE}`,
    `- Dominant Reason: ${summary?.summary?.dominantReason || UNKNOWN_VALUE}`,
    `- Failure Class: ${summary?.summary?.failureClass || UNKNOWN_VALUE}`,
    `- Readiness Failure: ${formatReadinessFailure(summary?.summary?.readinessFailure)}`,
    `- Failure Class Signals: ${(
      Array.isArray(summary?.summary?.failureClassSignals) &&
      summary.summary.failureClassSignals.length > ZERO
    ) ? summary.summary.failureClassSignals.join('|') : UNKNOWN_VALUE}`,
    `- Failure Action: ${summary?.summary?.failureAction || UNKNOWN_VALUE}`,
    `- Operator Recommendation: ${
      summary?.summary?.operatorRecommendation || UNKNOWN_VALUE
    }`,
    `- Bottleneck: ${summary?.summary?.bottleneckKind || UNKNOWN_VALUE}`,
    '',
    '## Artifact Paths',
    '',
    `- Report: ${summary?.artifacts?.reportPath || UNKNOWN_VALUE}`,
    `- Failure Bundle JSON: ${summary?.artifacts?.failureBundleJsonPath || UNKNOWN_VALUE}`,
    `- Failure Bundle Markdown: ${summary?.artifacts?.failureBundleMarkdownPath || UNKNOWN_VALUE}`,
    `- Playback Events: ${summary?.artifacts?.playbackEventsPath || UNKNOWN_VALUE}`,
    `- Timeline: ${summary?.artifacts?.timelinePath || UNKNOWN_VALUE}`,
    `- Analysis: ${summary?.artifacts?.analysisPath || UNKNOWN_VALUE}`,
  ];

  const topReasons = Array.isArray(summary?.summary?.topReasons) ?
    summary.summary.topReasons :
    [];
  lines.push('', '## Top Reasons', '');
  if (topReasons.length === ZERO) {
    lines.push('- none');
  } else {
    for (const reason of topReasons) {
      lines.push(
        `- ${String(reason?.reason || UNKNOWN_VALUE)}: ` +
          `${String(reason?.count ?? UNKNOWN_VALUE)}`,
      );
    }
  }

  const playbackEventSummary = summary?.playback?.eventSummary || null;
  lines.push('', '## Playback', '');
  lines.push(
    `- Load Started: ${playbackEventSummary?.load?.startedAt || UNKNOWN_VALUE}`,
  );
  lines.push(
    `- Load Completed: ${playbackEventSummary?.load?.completedAt || UNKNOWN_VALUE}`,
  );
  lines.push(
    `- Load Progress Events: ${String(playbackEventSummary?.load?.progressEventCount ?? UNKNOWN_VALUE)}`,
  );
  lines.push(
    `- Partition Created Events: ${String(playbackEventSummary?.topology?.partitionCreatedCount ?? UNKNOWN_VALUE)}`,
  );
  lines.push(
    `- Replica Created Events: ${String(playbackEventSummary?.topology?.replicaCreatedCount ?? UNKNOWN_VALUE)}`,
  );
  lines.push(
    `- Replica Removed Events: ${String(playbackEventSummary?.topology?.replicaRemovedCount ?? UNKNOWN_VALUE)}`,
  );

  const partitioning = summary?.partitioning || null;
  if (partitioning) {
    lines.push('', '## Partitioning', '');
    lines.push(`- Failure Mode: ${partitioning.failureMode || UNKNOWN_VALUE}`);
    lines.push(
      `- Baseline -> Current Partitions: ` +
        `${String(partitioning.baselinePartitionCount ?? UNKNOWN_VALUE)} -> ` +
        `${String(partitioning.currentPartitionCount ?? UNKNOWN_VALUE)}`,
    );
    lines.push(
      `- Additional Partitions Seen: ` +
        `${String(partitioning.additionalPartitionCount ?? UNKNOWN_VALUE)}`,
    );
    lines.push(
      `- Replica Spread Nodes: ${String(partitioning.replicaNodeCount ?? UNKNOWN_VALUE)}`,
    );
    lines.push(
      `- Selected Nodes: ${
        partitioning.selectedNodeIds?.join(', ') || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Ready Replica Nodes: ${
        partitioning.readyReplicaNodeIds?.join(', ') || UNKNOWN_VALUE
      }`,
    );
    lines.push(
      `- Admission-Ready Nodes: ${
        partitioning.admissionReadyNodeIds?.join(', ') || UNKNOWN_VALUE
      }`,
    );
  }

  const routingDiagnosticsByNodeId =
    isRecord(summary?.routingDiagnosticsByNodeId) ?
      summary.routingDiagnosticsByNodeId :
      {};
  lines.push('', '## Routing Diagnostics', '');
  if (Object.keys(routingDiagnosticsByNodeId).length === ZERO) {
    lines.push('- none');
  } else {
    for (const [nodeId, entry] of Object.entries(routingDiagnosticsByNodeId)) {
      lines.push(
        `- ${nodeId}: reason=${String(entry?.routingDiagnostics?.reasonCode || UNKNOWN_VALUE)}, ` +
          `services=${String(entry?.routingDiagnostics?.serviceRowCount ?? UNKNOWN_VALUE)}, ` +
          `routable=${String(entry?.routingDiagnostics?.routableServiceCount ?? UNKNOWN_VALUE)}, ` +
          `leader=${String(entry?.routingDiagnostics?.canonicalLeaderNodeId || UNKNOWN_VALUE)}`,
      );
    }
  }

  return lines.join('\n') + '\n';
}

function formatList(values) {
  const items = Array.isArray(values) ?
    values
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > ZERO) :
    [];
  return items.length > ZERO ? items.join(', ') : UNKNOWN_VALUE;
}

function formatCountEntries(entries) {
  if (!entries || typeof entries !== 'object') {
    return UNKNOWN_VALUE;
  }
  const rendered = Object.entries(entries)
    .map(([key, count]) => `${key}:${String(count ?? ZERO)}`)
    .filter((entry) => entry.length > ZERO);
  return rendered.length > ZERO ? rendered.join(', ') : UNKNOWN_VALUE;
}

function formatReasonPartitionEntries(entriesByReason) {
  if (!entriesByReason || typeof entriesByReason !== 'object') {
    return UNKNOWN_VALUE;
  }
  const rendered = Object.entries(entriesByReason)
    .map(([reason, partitionIds]) => {
      const normalizedReason = String(reason || '').trim();
      if (normalizedReason.length === ZERO) {
        return null;
      }
      const normalizedPartitionIds = normalizeDistinctStringArray(partitionIds);
      return normalizedReason + ':' +
        (normalizedPartitionIds.length > ZERO ?
          normalizedPartitionIds.join('|') :
          UNKNOWN_VALUE);
    })
    .filter((entry) => entry !== null);
  return rendered.length > ZERO ? rendered.join(', ') : UNKNOWN_VALUE;
}

function formatPriorityRecoveryInvariantFailures(failures) {
  const normalizedFailures = Array.isArray(failures) ? failures : [];
  if (normalizedFailures.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return normalizedFailures.map((failure) =>
    String(failure?.id || PRIORITY_RECOVERY_INVARIANT_FALLBACK),
  ).join(', ');
}

function formatPriorityRecoveryPartitionBlockerHistory(history) {
  const entries = Array.isArray(history) ? history : [];
  if (entries.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return entries.map((entry) => {
    const partitionId = String(entry?.partitionId || '').trim();
    const blockerReasons = normalizeDistinctStringArray(entry?.blockerReasons);
    return (partitionId.length > ZERO ? partitionId : UNKNOWN_VALUE) +
      '[' +
      (blockerReasons.length > ZERO ?
        blockerReasons.join('|') :
        PRIORITY_RECOVERY_BLOCKER_REASON_FALLBACK) +
      ']';
  }).join(', ');
}

function formatPriorityRecoveryPartitionSemanticStateHistory(history) {
  const entries = Array.isArray(history) ? history : [];
  if (entries.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return entries.map((entry) => {
    const partitionId = String(entry?.partitionId || '').trim();
    const semanticStates = normalizeDistinctStringArray(entry?.semanticStates);
    return (partitionId.length > ZERO ? partitionId : UNKNOWN_VALUE) +
      '[' +
      (semanticStates.length > ZERO ?
        semanticStates.join('|') :
        PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED) +
      ']';
  }).join(', ');
}

function formatPriorityRecoveryPartitionWitnesses(witnesses) {
  const entries = Array.isArray(witnesses) ? witnesses : [];
  if (entries.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return entries.map((entry) => {
    const partitionId = String(entry?.partitionId || '').trim();
    const parts = [partitionId.length > ZERO ? partitionId : UNKNOWN_VALUE];
    const semanticState = String(entry?.semanticState || '').trim();
    if (semanticState.length > ZERO) {
      parts.push('state=' + semanticState);
    }
    if (Number.isFinite(entry?.spreadGap)) {
      parts.push('gap=' + String(entry.spreadGap));
    }
    const blockerReasons = normalizeDistinctStringArray(entry?.blockerReasons);
    if (blockerReasons.length > ZERO) {
      parts.push('blockers=' + blockerReasons.join('|'));
    }
    const decisionDimension = String(entry?.decisionDimension || '').trim();
    if (decisionDimension.length > ZERO) {
      parts.push('decision=' + decisionDimension);
    }
    if (Number.isInteger(entry?.eligibleNodeCount)) {
      parts.push('eligible=' + String(entry.eligibleNodeCount));
    }
    const operationIds = normalizeDistinctStringArray(entry?.operationIds);
    if (operationIds.length > ZERO) {
      parts.push('ops=' + operationIds.join('|'));
    }
    const latestTimelineStep = String(
      entry?.latestOperationTimelineStep || '',
    ).trim();
    if (latestTimelineStep.length > ZERO) {
      parts.push('step=' + latestTimelineStep);
    }
    const latestStatus = String(entry?.latestOperationStatus || '').trim();
    if (latestStatus.length > ZERO) {
      parts.push('status=' + latestStatus);
    }
    const activeLearnerNodeIds = normalizeDistinctStringArray(
      entry?.activeLearnerNodeIds,
    );
    if (activeLearnerNodeIds.length > ZERO) {
      parts.push('learners=' + activeLearnerNodeIds.join('|'));
    }
    const promotableLearnerNodeIds = normalizeDistinctStringArray(
      entry?.promotableLearnerNodeIds,
    );
    if (promotableLearnerNodeIds.length > ZERO) {
      parts.push('promotable=' + promotableLearnerNodeIds.join('|'));
    }
    const excludedNodeIds = normalizeDistinctStringArray(
      entry?.recoveryEligibleExcludedNodeIds,
    );
    if (excludedNodeIds.length > ZERO) {
      parts.push('excluded=' + excludedNodeIds.join('|'));
    }
    return parts.join('#');
  }).join(', ');
}

function formatActiveGateProgress(progress) {
  if (!progress || typeof progress !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'active=' + String(progress.activeNodeCount ?? ZERO) +
      '/' + String(progress.expectedNodeCount ?? ZERO),
    'coverage=' + String(progress.snapshotCoverageNodeCount ?? ZERO) +
      '/' + String(progress.expectedNodeCount ?? ZERO),
    'publication=' + String(progress.publicationStatus || UNKNOWN_VALUE),
    'pendingAck=' + String(progress.pendingAckCount ?? ZERO),
    'missingPublished=' + String(progress.missingPublishedCount ?? ZERO),
    'prioritySpread=' + String(
      progress.prioritySpreadSatisfied === true ?
        'ready' :
        (progress.prioritySpreadSatisfied === false ? 'pending' : UNKNOWN_VALUE),
    ),
    'gateReasons=' + formatList(progress.gateReasons),
  ].join(', ');
}

function formatActiveGateReadinessDelay(readinessDelay) {
  const normalized = normalizeActiveGateReadinessDelay(readinessDelay);
  if (!normalized) {
    return UNKNOWN_VALUE;
  }
  const parts = [
    'timedOut=' + String(normalized.timedOut === true),
  ];
  if (normalized.cause) {
    parts.push('cause=' + normalized.cause);
  }
  if (normalized.recoverability) {
    parts.push('recoverability=' + normalized.recoverability);
  }
  if (normalized.source) {
    parts.push('source=' + normalized.source);
  }
  return parts.join(', ');
}

function formatReadinessFailure(readinessFailure) {
  const normalized = normalizeReadinessFailure(readinessFailure);
  if (!normalized) {
    return UNKNOWN_VALUE;
  }
  const parts = [
    'class=' + String(normalized.classCode || UNKNOWN_VALUE),
    'mode=' + String(normalized.mode || UNKNOWN_VALUE),
    'recoverability=' + String(normalized.recoverability || UNKNOWN_VALUE),
  ];
  if (normalized.source) {
    parts.push('source=' + normalized.source);
  }
  if (normalized.cause) {
    parts.push('cause=' + normalized.cause);
  }
  if (normalized.terminalReason) {
    parts.push('terminalReason=' + normalized.terminalReason);
  }
  if (Number.isInteger(normalized.progressSignal?.attemptsSinceProgress)) {
    const attempts = String(normalized.progressSignal.attemptsSinceProgress);
    const maxAttempts = Number.isInteger(normalized.progressSignal?.maxAttempts) ?
      String(normalized.progressSignal.maxAttempts) :
      UNKNOWN_VALUE;
    parts.push('attemptsSinceProgress=' + attempts + '/' + maxAttempts);
  }
  return parts.join(', ');
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
      '- Failure Class: ' +
        String(bundle.summary.failureClassification?.failureClass || UNKNOWN_VALUE),
      '- Readiness Failure: ' +
        formatReadinessFailure(bundle.summary.readinessFailure),
      `- Bottleneck: ${bundle.summary.bottleneckEstimate?.kind || UNKNOWN_VALUE}`,
      `- Report: ${bundle.reportPath || UNKNOWN_VALUE}`,
    ].join('\n'),
  ];

  if (bundle?.publicationConvergence) {
    const publicationGateReasons = Array.isArray(
      bundle.publicationConvergence.publicationConvergenceGateReasons,
    ) ? bundle.publicationConvergence.publicationConvergenceGateReasons : [];
    const activeGateBlockerHistory = Array.isArray(
      bundle.publicationConvergence.activeGateBlockerHistory,
    ) ? bundle.publicationConvergence.activeGateBlockerHistory : [];
    const activeGateNoProgress =
      bundle.publicationConvergence.activeGateNoProgress &&
        typeof bundle.publicationConvergence.activeGateNoProgress === 'object' ?
        bundle.publicationConvergence.activeGateNoProgress :
        null;
    sections.push(
      '## Publication Convergence\n' +
      [
        '- Publication Epoch: ' +
          String(bundle.publicationConvergence.publicationEpoch ?? UNKNOWN_VALUE),
        '- Publication Status: ' +
          String(bundle.publicationConvergence.publicationStatus || UNKNOWN_VALUE),
        '- Pending Ack Count: ' +
          String(bundle.publicationConvergence.pendingAckCount ?? ZERO),
        '- Blocked Node Count: ' +
          String(bundle.publicationConvergence.blockedNodeCount ?? ZERO),
        '- Pending Ack Nodes: ' +
          formatList(bundle.publicationConvergence.pendingAckNodeIds),
        '- Blocked Nodes: ' +
          formatList(bundle.publicationConvergence.blockedNodeIds),
        '- Publication Gate Reasons: ' +
          formatList(publicationGateReasons),
        '- Priority Recovery Progress Classes: ' +
          formatList(
            bundle.publicationConvergence.priorityRecoveryProgressClassIds,
          ),
        '- Priority Recovery Semantic States: ' +
          formatList(
            bundle.publicationConvergence.priorityRecoverySemanticStateIds,
          ),
        '- Priority Recovery Blocked Partition Count: ' +
          String(
            bundle.publicationConvergence.priorityRecoveryBlockedPartitionCount ??
            ZERO,
          ),
        '- Priority Recovery Blocked Partitions: ' +
          formatList(
            bundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
          ),
        '- Priority Recovery Partition Blockers: ' +
          formatReasonPartitionEntries(
            bundle.publicationConvergence
              .priorityRecoveryBlockerPartitionIdsByReason,
          ),
        '- Priority Recovery Partition Semantic States: ' +
          formatReasonPartitionEntries(
            bundle.publicationConvergence
              .priorityRecoveryPartitionIdsBySemanticState,
          ),
        '- Priority Recovery Per-Partition History: ' +
          formatPriorityRecoveryPartitionBlockerHistory(
            bundle.publicationConvergence
              .priorityRecoveryPartitionBlockerHistory,
          ),
        '- Priority Recovery Per-Partition Semantic History: ' +
          formatPriorityRecoveryPartitionSemanticStateHistory(
            bundle.publicationConvergence
              .priorityRecoveryPartitionSemanticStateHistory,
          ),
        '- Priority Recovery Partition Witnesses: ' +
          formatPriorityRecoveryPartitionWitnesses(
            bundle.publicationConvergence
              .priorityRecoveryPartitionWitnesses,
          ),
        '- Priority Recovery Admission Dimensions: ' +
          formatList(
            bundle.publicationConvergence
              .priorityRecoveryAdmissionDecisionDimensions,
          ),
        '- Priority Recovery Failing Invariants: ' +
          formatList(
            bundle.publicationConvergence.priorityRecoveryInvariantFailingIds,
          ),
        '- Priority Recovery Invariant Failures: ' +
          formatPriorityRecoveryInvariantFailures(
            bundle.publicationConvergence.priorityRecoveryInvariantFailures,
          ),
        '- Active Gate Progress: ' +
          formatActiveGateProgress(
            bundle.publicationConvergence.activeGateProgress,
          ),
        '- Active Gate Best Progress: ' +
          formatActiveGateProgress(
            bundle.publicationConvergence.activeGateBestProgress,
          ),
        '- Active Gate No-Progress: ' +
          (activeGateNoProgress ?
            (
              'attemptsSinceProgress=' +
              String(activeGateNoProgress.attemptsSinceProgress ?? UNKNOWN_VALUE) +
              '/' +
              String(activeGateNoProgress.maxAttempts ?? UNKNOWN_VALUE) +
              ', stalled=' +
              String(activeGateNoProgress.stalled === true)
            ) :
            UNKNOWN_VALUE),
        '- Active Gate Blocker History: ' +
          (
            activeGateBlockerHistory.length > ZERO ?
              activeGateBlockerHistory.map((entry) => {
                const signature = String(entry?.signature || '').trim();
                const count = Number(entry?.count || ZERO);
                return (signature.length > ZERO ? signature : UNKNOWN_VALUE) +
                  ':' +
                  String(count);
              }).join(', ') :
              UNKNOWN_VALUE
          ),
        '- Active Gate Readiness Delay: ' +
          formatActiveGateReadinessDelay(
            bundle.publicationConvergence.activeGateReadinessDelay,
          ),
      ].join('\n'),
    );
  }

  if (bundle?.recoveryReadiness) {
    sections.push(
      '## Recovery Readiness\n' +
      [
        '- Routing Dimension Counts: ' +
          formatCountEntries(bundle.recoveryReadiness.routingDimensionCounts),
        '- Repair-Routed Nodes: ' +
          formatList(bundle.recoveryReadiness.repairRoutedNodeIds),
        '- Recovery-Routed Nodes: ' +
          formatList(bundle.recoveryReadiness.recoveryRoutedNodeIds),
        '- Recovery-Only Eligible Nodes: ' +
          formatList(bundle.recoveryReadiness.recoveryOnlyNodeIds),
        '- Repair-Routed Recovery-Only Nodes: ' +
          formatList(bundle.recoveryReadiness.repairRoutedRecoveryOnlyNodeIds),
        '- Write-Unhealthy Nodes: ' +
          formatList(bundle.recoveryReadiness.writeUnhealthyNodeIds),
        '- Publication-Blocked Nodes: ' +
          formatList(bundle.recoveryReadiness.publicationBlockedNodeIds),
        '- Pending Ack Nodes: ' +
          formatList(bundle.recoveryReadiness.pendingAckNodeIds),
        '- Pending Ack Recovery-Only Nodes: ' +
          formatList(bundle.recoveryReadiness.pendingAckRecoveryOnlyNodeIds),
        '- Pending Ack Repair-Eligible Nodes: ' +
          formatList(bundle.recoveryReadiness.pendingAckRepairEligibleNodeIds),
        '- Pending Ack Blocked Nodes: ' +
          formatList(bundle.recoveryReadiness.pendingAckBlockedNodeIds),
      ].join('\n'),
    );
  }

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
        '- Readiness Failure: ' +
          formatReadinessFailure(bundle.diagnostics.noProgress.readinessFailure),
      ].join('\n'),
    );
  }

  if (bundle?.summary?.failureAction || bundle?.summary?.operatorRecommendation) {
    sections.push(
      '## Readiness Guidance\n' +
      [
        '- Failure Action: ' +
          String(bundle.summary.failureAction || UNKNOWN_VALUE),
        '- Operator Recommendation: ' +
          String(bundle.summary.operatorRecommendation || UNKNOWN_VALUE),
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
        if (nodeDiagnostic?.decisionArtifacts?.latestStartupDecision) {
          lines.push(
            '- Latest Startup Decision: ' +
              JSON.stringify(nodeDiagnostic.decisionArtifacts.latestStartupDecision),
          );
        }
        if (nodeDiagnostic?.decisionArtifacts?.latestRuntimeHandoff) {
          lines.push(
            '- Latest Runtime Handoff: ' +
              JSON.stringify(nodeDiagnostic.decisionArtifacts.latestRuntimeHandoff),
          );
        }
        if (Array.isArray(nodeDiagnostic?.restartBoundaries) &&
            nodeDiagnostic.restartBoundaries.length > ZERO) {
          lines.push(
            '- Restart Boundaries: ' +
              nodeDiagnostic.restartBoundaries.map((boundary) =>
                String(boundary.phase || UNKNOWN_VALUE) + '@' +
                String(boundary.timestamp || UNKNOWN_VALUE),
              ).join(', '),
          );
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
            `[${String(
              scenario.summary.failureClassification?.failureClass ||
              UNKNOWN_VALUE,
            )}] (${scenario.markdownPath})`,
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

  if (isRecord(bundleJson.summary?.failureClassification)) {
    diagnostics.failureClassification = bundleJson.summary.failureClassification;
    entry.failureClassification = bundleJson.summary.failureClassification;
  }

  if (isRecord(bundleJson.summary?.readinessFailure)) {
    diagnostics.readinessFailure = bundleJson.summary.readinessFailure;
    entry.readinessFailure = bundleJson.summary.readinessFailure;
  }

  if (typeof bundleJson.summary?.failureAction === 'string' &&
      bundleJson.summary.failureAction.length > ZERO) {
    diagnostics.failureAction = bundleJson.summary.failureAction;
    entry.failureAction = bundleJson.summary.failureAction;
  }

  if (typeof bundleJson.summary?.operatorRecommendation === 'string' &&
      bundleJson.summary.operatorRecommendation.length > ZERO) {
    diagnostics.operatorRecommendation =
      bundleJson.summary.operatorRecommendation;
    entry.operatorRecommendation = bundleJson.summary.operatorRecommendation;
  }

  if (isRecord(bundleJson.publicationConvergence)) {
    diagnostics.publicationConvergence = bundleJson.publicationConvergence;
    entry.publicationConvergence = bundleJson.publicationConvergence;
  }

  if (isRecord(bundleJson.controlPlane?.priorityRecoveryDecisionSnapshots)) {
    diagnostics.priorityRecoveryDecisionSnapshots =
      bundleJson.controlPlane.priorityRecoveryDecisionSnapshots;
    entry.priorityRecoveryDecisionSnapshots =
      bundleJson.controlPlane.priorityRecoveryDecisionSnapshots;
  }

  if (isRecord(bundleJson.controlPlane?.priorityRecoveryInvariants)) {
    diagnostics.priorityRecoveryInvariants =
      bundleJson.controlPlane.priorityRecoveryInvariants;
    entry.priorityRecoveryInvariants =
      bundleJson.controlPlane.priorityRecoveryInvariants;
  }

  if (bundleJson.decisionArtifactsByNodeId &&
      typeof bundleJson.decisionArtifactsByNodeId === 'object') {
    diagnostics.decisionArtifactsByNodeId = bundleJson.decisionArtifactsByNodeId;
    entry.decisionArtifactsByNodeId = bundleJson.decisionArtifactsByNodeId;
  }

  if (isRecord(bundleJson.diagnostics?.firstFaultTimeline)) {
    diagnostics.firstFaultTimeline = bundleJson.diagnostics.firstFaultTimeline;
  }

  if (isRecord(bundleJson.recoveryReadiness)) {
    diagnostics.recoveryReadiness = bundleJson.recoveryReadiness;
    entry.recoveryReadiness = bundleJson.recoveryReadiness;
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
    const triageJsonAbsolutePath = join(scenarioDir, TRIAGE_SUMMARY_JSON_FILENAME);
    const triageMarkdownAbsolutePath = join(
      scenarioDir,
      TRIAGE_SUMMARY_MARKDOWN_FILENAME,
    );
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
    const triageLinks = {
      jsonPath: toWorkspaceRelative(jsonAbsolutePath, workspaceRoot),
      markdownPath: toWorkspaceRelative(markdownAbsolutePath, workspaceRoot),
    };
    const triageSummary = buildScenarioTriageSummary(bundleJson, triageLinks);
    await writeFile(
      triageJsonAbsolutePath,
      JSON.stringify(triageSummary, null, 2),
      UTF8_ENCODING,
    );
    await writeFile(
      triageMarkdownAbsolutePath,
      renderScenarioTriageSummaryMarkdown(triageSummary),
      UTF8_ENCODING,
    );
    const links = {
      ...triageLinks,
      triageJsonPath: toWorkspaceRelative(triageJsonAbsolutePath, workspaceRoot),
      triageMarkdownPath:
        toWorkspaceRelative(triageMarkdownAbsolutePath, workspaceRoot),
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
