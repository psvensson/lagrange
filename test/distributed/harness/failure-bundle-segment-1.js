import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { ENTRYPOINT_LOG_MSG } from "../../../src/constants/entrypoint.js";
import { classifyActiveGateClosureWitness } from "./active-gate-closure-classification.js";
import {
  ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE,
  ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT,
  ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT,
  ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE,
  ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_TERMINAL,
  STARTUP_READINESS_MODE_STARTUP,
} from "./startup-readiness-evidence.js";
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
} from "../../../src/control-plane/priority-recovery-diagnostics-constants.js";

const FAILURE_BUNDLE_SCHEMA_VERSION = 1;
const FAILURE_BUNDLE_RUN_DIRNAME = "failure-bundles";
const FAILURE_BUNDLE_JSON_FILENAME = "failure-bundle.json";
const FAILURE_BUNDLE_MARKDOWN_FILENAME = "failure-bundle.md";
const TRIAGE_SUMMARY_JSON_FILENAME = "triage-summary.json";
const TRIAGE_SUMMARY_MARKDOWN_FILENAME = "triage-summary.md";
const RUN_FAILURE_BUNDLE_JSON_FILENAME = "run-failure-bundle.json";
const RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME = "run-failure-bundle.md";
const LOG_FILE_EXTENSION = ".log";
const TIMELINE_FILENAME = "_timeline.log";
const ANALYSIS_FILENAME = "_analysis.json";
const UTF8_ENCODING = "utf8";
const ZERO = 0;
const LOG_TAIL_LINE_COUNT = 20;
const MARKDOWN_SECTION_BREAK = "\n\n";
const UNKNOWN_VALUE = "unknown";
const NO_PROGRESS_REASON_CODE = "stalled_no_progress";
const READINESS_FAILURE_CLASS_NO_PROGRESS = "no_progress_terminal";
const NODE_DIAGNOSTICS_TRACE_LIMIT = 5;
const NODE_ID_ERROR_PATTERN = /\bnode=([a-z0-9._:-]+)\b/gi;
const PLAYBACK_EVENTS_FILENAME = "events.ndjson";
const PLAYBACK_EVENT_TYPE_CLUSTER_STAGE = "cluster.stage";
const PLAYBACK_EVENT_TYPE_LOAD_STARTED = "load.started";
const PLAYBACK_EVENT_TYPE_LOAD_PROGRESS = "load.progress";
const PLAYBACK_EVENT_TYPE_LOAD_COMPLETED = "load.completed";
const PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY = "node.restart.boundary";
const PLAYBACK_EVENT_TYPE_PARTITION_CREATED = "partition.created";
const PLAYBACK_EVENT_TYPE_REPLICA_CREATED = "replica.created";
const PLAYBACK_EVENT_TYPE_REPLICA_REMOVED = "replica.removed";
const PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE =
  "setup.cluster.waiting-active";
const ROOT_CAUSE_CLASS_UNKNOWN = "unknown";
const ROOT_CAUSE_CLASS_STARTUP = "startup";
const ROOT_CAUSE_CLASS_DISCOVERY = "discovery";
const ROOT_CAUSE_CLASS_TOPOLOGY = "topology";
const ROOT_CAUSE_CLASS_LOAD = "load";
const ROOT_CAUSE_CLASS_CDC = "cdc";
const ROOT_CAUSE_CLASS_CACHE = "cache";
const FIRST_FAULT_MARKER_QUEUE_PRESSURE = "queuePressureOnset";
const FIRST_FAULT_MARKER_ATTEMPT_ERRORS = "attemptErrorOnset";
const FIRST_FAULT_MARKER_HARD_FAILURE = "hardFailureOnset";
const LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE = "nodeSlotUnavailable";
const LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED = "nodeAdmissionBlocked";
const LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE =
  "retryableControlPlanePressure";
const LOAD_WAIT_REASON_TIMEOUT_WAITS = "timeoutWaits";
const LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED = "queueCapacityRejected";
const READINESS_REASON_MAX_NODES = 25;
const READINESS_REASON_MAX_PER_NODE = 5;
const AFFECTED_NODE_ID_LIMIT = 25;
const FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED =
  "publication_convergence_blocked";
const FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED = "startup_recovery_blocked";
const FAILURE_CLASS_DISCOVERY_UNAVAILABLE = "discovery_unavailable";
const FAILURE_CLASS_TOPOLOGY_UNSTABLE = "topology_unstable";
const FAILURE_CLASS_LOAD_PRESSURE = "load_pressure";
const FAILURE_CLASS_CDC_DEGRADED = "cdc_degraded";
const FAILURE_CLASS_CACHE_STALE = "cache_stale";
const FAILURE_CLASS_VERIFICATION_MISMATCH = "verification_mismatch";
const FAILURE_CLASS_UNKNOWN = "unknown";
const FAILURE_CLASS_CONFIDENCE_HIGH = "high";
const FAILURE_CLASS_CONFIDENCE_MEDIUM = "medium";
const FAILURE_CLASS_CONFIDENCE_LOW = "low";
const TRIAGE_CLUSTER_STAGE_LIMIT = 12;
const TRIAGE_RECENT_TOPOLOGY_EVENT_LIMIT = 10;
const TRIAGE_TOP_LOAD_NODE_LIMIT = 5;
const STABILITY_GATE_STATUS_OPEN = "open";
const STABILITY_GATE_STATUS_CLOSED = "closed";
const STABILITY_GATE_STATUS_NOT_APPLICABLE = "not_applicable";
const STABILITY_GATE_STATUS_UNKNOWN = "unknown";
const STABILITY_GATE_TYPE_FAILOVER = "failover";
const STABILITY_GATE_TYPE_CONVERGENCE = "convergence";
const STABILITY_GATE_TYPE_RESTART_RECOVERY = "restart_recovery";
const STABILITY_GATE_BLOCKER_PUBLICATION_PENDING = "publication_pending";
const STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING =
  "priority_spread_pending";
const STABILITY_GATE_BLOCKER_PENDING_ACK_NODES = "pending_ack_nodes";
const STABILITY_GATE_BLOCKER_BLOCKED_NODES = "publication_blocked_nodes";
const STABILITY_GATE_BLOCKER_CLOSURE_RECORD = "closure_record";
const STABILITY_GATE_BLOCKER_STARTUP_READINESS = "startup_readiness_blocked";
const SCENARIO_NAME_FRAGMENT_RESTART = "restart";

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
  if (typeof targetPath !== "string" || targetPath.length === ZERO) {
    return null;
  }
  return relative(workspaceRoot, resolve(targetPath));
}

function sanitizePathSegment(value, fallback = UNKNOWN_VALUE) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > ZERO ? normalized : fallback;
}

function sliceLogTail(logContent, maxLines = LOG_TAIL_LINE_COUNT) {
  const lines = String(logContent || "")
    .split("\n")
    .filter((line) => line.length > ZERO);
  return lines.slice(-Math.max(1, maxLines));
}

function parseStructuredLogLine(line) {
  const jsonStart = String(line || "").indexOf("{");
  if (jsonStart < ZERO) {
    return null;
  }
  try {
    const parsed = JSON.parse(String(line).slice(jsonStart));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function resolveStructuredLogMessage(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return "";
  }
  if (typeof parsed.msg === "string") {
    return parsed.msg;
  }
  if (typeof parsed.message === "string") {
    return parsed.message;
  }
  return "";
}

function resolveStructuredLogTimestamp(parsed) {
  if (typeof parsed?.time === "string" && parsed.time.length > ZERO) {
    return parsed.time;
  }
  if (typeof parsed?.timestamp === "string" && parsed.timestamp.length > ZERO) {
    return parsed.timestamp;
  }
  return null;
}

function sanitizeStructuredDecisionArtifact(parsed, fields) {
  if (!parsed || typeof parsed !== "object") {
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
  const lines = String(content || "").split("\n");
  for (const line of lines) {
    const parsed = parseStructuredLogLine(line);
    if (!parsed) {
      continue;
    }
    const message = resolveStructuredLogMessage(parsed);
    if (message === ENTRYPOINT_LOG_MSG.AUTO_REJOIN_DECISION) {
      startupDecisions.push(
        sanitizeStructuredDecisionArtifact(parsed, [
          "nodeId",
          "mode",
          "source",
          "startupMode",
          "peerAddress",
        ]),
      );
      continue;
    }
    if (message === ENTRYPOINT_LOG_MSG.STARTUP_RUNTIME_HANDOFF) {
      runtimeHandoffs.push(
        sanitizeStructuredDecisionArtifact(parsed, [
          "nodeId",
          "startupBranch",
          "startupPhase",
          "bootstrapApiHasSqlQueryEngine",
          "bootstrapApiHasMessageRouter",
          "bootstrapApiHasStartupRecoveryCoordinator",
          "adminRuntimeStarted",
          "adminPort",
        ]),
      );
    }
  }
  if (startupDecisions.length === ZERO && runtimeHandoffs.length === ZERO) {
    return null;
  }
  return {
    startupDecisions: startupDecisions.filter(Boolean),
    runtimeHandoffs: runtimeHandoffs.filter(Boolean),
    latestStartupDecision:
      startupDecisions.length > ZERO
        ? startupDecisions[startupDecisions.length - 1]
        : null,
    latestRuntimeHandoff:
      runtimeHandoffs.length > ZERO
        ? runtimeHandoffs[runtimeHandoffs.length - 1]
        : null,
  };
}

function resolveRoutingDiagnostics(logExcerpt) {
  for (const line of [
    ...(Array.isArray(logExcerpt) ? logExcerpt : []),
  ].reverse()) {
    const parsed = parseStructuredLogLine(line);
    if (
      !parsed ||
      parsed.subsystem !== "query-executor" ||
      !parsed.routingSnapshot ||
      typeof parsed.routingSnapshot !== "object"
    ) {
      continue;
    }
    return parsed.routingSnapshot;
  }
  return null;
}

function resolveFailureDiagnostics(entry) {
  const diagnostics = entry?.details?.diagnostics;
  return diagnostics && typeof diagnostics === "object" ? diagnostics : {};
}

function addNormalizedReasonCount(reasonCounts, reason, count = 1) {
  const normalizedReason = String(reason || "").trim();
  const normalizedCount = normalizeNonNegativeCount(count);
  if (
    normalizedReason.length === ZERO ||
    normalizedCount === null ||
    normalizedCount <= ZERO
  ) {
    return;
  }
  reasonCounts[normalizedReason] =
    (reasonCounts[normalizedReason] || ZERO) + normalizedCount;
}

function deriveReasonCountsFromPublicationConvergence(controlPlane = null) {
  const publicationConvergence =
    buildPublicationConvergenceSummary(controlPlane);
  if (!publicationConvergence || typeof publicationConvergence !== "object") {
    return {};
  }
  const reasonCounts = {};
  if (isRecord(publicationConvergence.blockingReasonCounts)) {
    for (const [reason, count] of Object.entries(
      publicationConvergence.blockingReasonCounts,
    )) {
      addNormalizedReasonCount(reasonCounts, reason, count);
    }
  }
  for (const reason of normalizeDistinctStringArray(
    publicationConvergence.publicationConvergenceGateReasons,
  )) {
    addNormalizedReasonCount(reasonCounts, reason, 1);
  }
  for (const reason of normalizeDistinctStringArray(
    publicationConvergence.priorityRecoveryReasonCodes,
  )) {
    addNormalizedReasonCount(reasonCounts, reason, 1);
  }
  addNormalizedReasonCount(
    reasonCounts,
    "publication_pending_ack",
    publicationConvergence.pendingAckCount || ZERO,
  );
  addNormalizedReasonCount(
    reasonCounts,
    "publication_blocked_nodes",
    publicationConvergence.blockedNodeCount || ZERO,
  );
  if (publicationConvergence.publicationPending === true) {
    addNormalizedReasonCount(reasonCounts, "publication_pending", 1);
  }
  if (publicationConvergence.prioritySpreadPending === true) {
    addNormalizedReasonCount(reasonCounts, "priority_spread_pending", 1);
  }
  if (
    publicationConvergence.closureWitnessClass &&
    typeof publicationConvergence.closureWitnessClass === "string"
  ) {
    const normalizedClosureWitness =
      publicationConvergence.closureWitnessClass.trim();
    if (normalizedClosureWitness.length > ZERO) {
      addNormalizedReasonCount(
        reasonCounts,
        "closure_witness_" + normalizedClosureWitness,
        1,
      );
    }
  }
  if (publicationConvergence.priorityRecoveryProgressClassCount > ZERO) {
    addNormalizedReasonCount(
      reasonCounts,
      "priority_recovery_progress_class",
      publicationConvergence.priorityRecoveryProgressClassCount,
    );
  }
  if (
    Array.isArray(publicationConvergence.priorityRecoveryInvariantFailingIds) &&
    publicationConvergence.priorityRecoveryInvariantFailingIds.length > ZERO
  ) {
    addNormalizedReasonCount(
      reasonCounts,
      "priority_recovery_invariant_failure",
      publicationConvergence.priorityRecoveryInvariantFailingIds.length,
    );
  }
  return reasonCounts;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeActiveGateReadinessDelay(rawDelay = null) {
  if (!isRecord(rawDelay)) {
    return null;
  }
  const normalized = {
    timedOut: rawDelay.timedOut === true,
    cause: typeof rawDelay.cause === "string" ? rawDelay.cause.trim() : null,
    source: typeof rawDelay.source === "string" ? rawDelay.source.trim() : null,
    recoverability:
      typeof rawDelay.recoverability === "string"
        ? rawDelay.recoverability.trim()
        : null,
    error: typeof rawDelay.error === "string" ? rawDelay.error.trim() : null,
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
    "activeGateReadinessDelay=" +
      (normalized.timedOut === true ? "timeout" : "none"),
  );
  if (
    normalized.cause &&
    normalized.cause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE
  ) {
    signals.push("activeGateReadinessCause=" + normalized.cause);
  }
  if (normalized.recoverability) {
    signals.push(
      "activeGateReadinessRecoverability=" + normalized.recoverability,
    );
  }
  if (normalized.source) {
    signals.push("activeGateReadinessDelaySource=" + normalized.source);
  }
  return signals;
}

function appendReadinessFailureSignals(signals = [], readinessFailure = null) {
  const normalized = normalizeReadinessFailure(readinessFailure);
  if (!normalized) {
    return signals;
  }
  if (normalized.classCode) {
    signals.push("activeGateReadinessClass=" + normalized.classCode);
  }
  if (normalized.recoverability) {
    signals.push(
      "activeGateReadinessRecoverability=" + normalized.recoverability,
    );
  }
  if (normalized.mode) {
    signals.push("activeGateReadinessMode=" + normalized.mode);
  }
  if (Number.isInteger(normalized.progressSignal?.attemptsSinceProgress)) {
    signals.push(
      "activeGateReadinessProgressAttemptsSince=" +
        String(normalized.progressSignal.attemptsSinceProgress),
    );
  }
  if (Number.isInteger(normalized.progressSignal?.maxAttempts)) {
    signals.push(
      "activeGateReadinessProgressMaxAttempts=" +
        String(normalized.progressSignal.maxAttempts),
    );
  }
  if (normalized.terminalReason) {
    signals.push(
      "activeGateReadinessTerminalReason=" + normalized.terminalReason,
    );
  }
  return signals;
}

function normalizeReadinessFailure(rawReadinessFailure = null) {
  if (!isRecord(rawReadinessFailure)) {
    return null;
  }
  const progressSignal = isRecord(rawReadinessFailure.progressSignal)
    ? rawReadinessFailure.progressSignal
    : null;
  const normalized = {
    mode:
      typeof rawReadinessFailure.mode === "string" &&
      rawReadinessFailure.mode.length > ZERO
        ? rawReadinessFailure.mode
        : null,
    classCode:
      typeof rawReadinessFailure.classCode === "string" &&
      rawReadinessFailure.classCode.length > ZERO
        ? rawReadinessFailure.classCode
        : null,
    recoverability:
      typeof rawReadinessFailure.recoverability === "string" &&
      rawReadinessFailure.recoverability.length > ZERO
        ? rawReadinessFailure.recoverability
        : null,
    progressSignal: isRecord(progressSignal)
      ? {
          attemptsSinceProgress: Number.isInteger(
            progressSignal.attemptsSinceProgress,
          )
            ? Math.max(ZERO, progressSignal.attemptsSinceProgress)
            : null,
          maxAttempts:
            Number.isInteger(progressSignal.maxAttempts) &&
            progressSignal.maxAttempts > ZERO
              ? Math.max(ZERO, progressSignal.maxAttempts)
              : null,
          stalled: progressSignal.stalled === true,
        }
      : null,
    terminalReason:
      typeof rawReadinessFailure.terminalReason === "string" &&
      rawReadinessFailure.terminalReason.length > ZERO
        ? rawReadinessFailure.terminalReason
        : null,
    source:
      typeof rawReadinessFailure.source === "string" &&
      rawReadinessFailure.source.length > ZERO
        ? rawReadinessFailure.source
        : null,
    cause:
      typeof rawReadinessFailure.cause === "string" &&
      rawReadinessFailure.cause.length > ZERO
        ? rawReadinessFailure.cause
        : null,
    error:
      typeof rawReadinessFailure.error === "string" &&
      rawReadinessFailure.error.length > ZERO
        ? rawReadinessFailure.error
        : null,
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
  const activeGateNoProgress =
    controlPlane?.activeGateNoProgress &&
    typeof controlPlane.activeGateNoProgress === "object"
      ? controlPlane.activeGateNoProgress
      : null;
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
  if (!isRecord(activeGateNoProgress) && !readinessDelay) {
    return null;
  }
  const attemptsSinceProgress = Number.isInteger(
    activeGateNoProgress?.attemptsSinceProgress,
  )
    ? Math.max(ZERO, activeGateNoProgress.attemptsSinceProgress)
    : null;
  const maxAttempts =
    Number.isInteger(activeGateNoProgress?.maxAttempts) &&
    activeGateNoProgress.maxAttempts > ZERO
      ? Math.max(ZERO, activeGateNoProgress.maxAttempts)
      : null;
  const stalled = activeGateNoProgress?.stalled === true;
  const reasonCode = activeGateNoProgress?.reasonCode;
  const classCode =
    readinessDelay &&
    readinessDelay.timedOut === true &&
    readinessDelay.cause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE
      ? readinessDelay.cause
      : stalled || reasonCode === NO_PROGRESS_REASON_CODE
        ? READINESS_FAILURE_CLASS_NO_PROGRESS
        : null;
  return normalizeReadinessFailure({
    mode: activeGateNoProgress?.mode || null,
    classCode,
    recoverability: readinessDelay?.recoverability || null,
    progressSignal: {
      attemptsSinceProgress,
      maxAttempts,
      stalled,
    },
    terminalReason:
      typeof reasonCode === "string" && reasonCode.length > ZERO
        ? reasonCode
        : null,
    source: readinessDelay?.source || null,
    cause: readinessDelay?.cause || null,
    error: readinessDelay?.error || null,
  });
}

function resolveReadinessFailureGuidance(readinessFailure = null) {
  if (!isRecord(readinessFailure) || readinessFailure.classCode === null) {
    return {
      failureAction: null,
      operatorRecommendation: null,
    };
  }
  if (
    readinessFailure.classCode ===
      ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT ||
    readinessFailure.classCode ===
      ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT
  ) {
    if (
      readinessFailure.recoverability ===
      ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE
    ) {
      return {
        failureAction:
          "Probe delay is recoverable in this path; allow bounded retry.",
        operatorRecommendation:
          "Re-run with reduced startup concurrency and watch snapshot probe latencies.",
      };
    }
    return {
      failureAction: "Snapshot/reachability timeout is blocking convergence.",
      operatorRecommendation:
        "Inspect snapshot query latency, admin readiness, and host/network stability before rerun.",
    };
  }
  if (readinessFailure.classCode === READINESS_FAILURE_CLASS_NO_PROGRESS) {
    return {
      failureAction:
        "Convergence has stopped progressing within configured guarantees.",
      operatorRecommendation:
        "Inspect publication convergence blockers and topology readiness evidence before retry.",
    };
  }
  return {
    failureAction: "Readiness convergence issue requires triage.",
    operatorRecommendation:
      "Collect active-gate diagnostics and follow triage priorities before rerun.",
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
  if (reasonCounts && typeof reasonCounts === "object") {
    return reasonCounts;
  }
  if (fallbackReasonCounts && typeof fallbackReasonCounts === "object") {
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
    const normalized = String(value || "").trim();
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
  const normalizedPartitionId = String(partitionId || "").trim();
  if (normalizedPartitionId.length === ZERO) {
    return String(fallback || PRIORITY_RECOVERY_CORRELATION_KEY.UNKNOWN);
  }
  const normalizedEpoch = Number.isFinite(epoch)
    ? String(Math.floor(epoch))
    : PRIORITY_RECOVERY_CORRELATION_KEY.EPOCH_UNKNOWN;
  const normalizedOperationId = String(operationId || "").trim();
  return [
    normalizedPartitionId,
    normalizedEpoch,
    normalizedOperationId.length > ZERO
      ? normalizedOperationId
      : PRIORITY_RECOVERY_CORRELATION_KEY.OPERATION_UNKNOWN,
  ].join(PRIORITY_RECOVERY_CORRELATION_KEY.SEPARATOR);
}

function normalizePriorityRecoverySemanticStateId(semanticState) {
  const normalizedSemanticState = String(semanticState || "").trim();
  if (normalizedSemanticState.length === ZERO) {
    return null;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(normalizedSemanticState)
    ? normalizedSemanticState
    : null;
}

function inferPriorityRecoverySemanticState(snapshot, blockerReasons = []) {
  for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
    if (!blockerReasons.includes(blockerReason)) {
      continue;
    }
    return (
      PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED
    );
  }
  if (snapshot?.planner?.ready === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
  }
  if (snapshot?.spreadCompletion?.satisfied === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  if (
    Number(snapshot?.coordinator?.operationCount) > ZERO ||
    (typeof snapshot?.operationId === "string" &&
      snapshot.operationId.length > ZERO)
  ) {
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
      const normalizedBlockerReason = String(blockerReason || "").trim();
      if (normalizedBlockerReason.length === ZERO) {
        continue;
      }
      if (
        !(blockerPartitionIdsByReason[normalizedBlockerReason] instanceof Set)
      ) {
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

  for (const snapshot of Array.isArray(value.snapshots)
    ? value.snapshots
    : []) {
    if (!isRecord(snapshot)) {
      continue;
    }
    const partitionId = String(snapshot.partitionId || "").trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    partitionIdSet.add(partitionId);
    const epoch = Number.isFinite(snapshot.epoch)
      ? Math.floor(snapshot.epoch)
      : null;
    const operationId = String(snapshot.operationId || "").trim() || null;
    const blockerReasons = normalizeDistinctStringArray(
      snapshot.blockerReasons,
    );
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
      planner: isRecord(snapshot.planner)
        ? cloneJsonValue(snapshot.planner)
        : null,
      admission: isRecord(snapshot.admission)
        ? cloneJsonValue(snapshot.admission)
        : null,
      coordinator: isRecord(snapshot.coordinator)
        ? cloneJsonValue(snapshot.coordinator)
        : null,
      publication: isRecord(snapshot.publication)
        ? cloneJsonValue(snapshot.publication)
        : null,
      readiness: isRecord(snapshot.readiness)
        ? cloneJsonValue(snapshot.readiness)
        : null,
      blockerReasons,
      semanticState,
    });
  }

  const normalizedBlockerPartitionIdsByReason = {};
  for (const [blockerReason, partitionIds] of Object.entries(
    blockerPartitionIdsByReason,
  )) {
    normalizedBlockerPartitionIdsByReason[blockerReason] = [
      ...partitionIds,
    ].sort();
  }
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = [
      ...partitionIds,
    ].sort();
  }
  const publicationEpoch = Number.isFinite(value.publicationEpoch)
    ? Math.floor(value.publicationEpoch)
    : null;
  return {
    schemaVersion: Number.isFinite(value.schemaVersion)
      ? Math.floor(value.schemaVersion)
      : null,
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
  const normalizedFallback =
    normalizePriorityRecoveryDecisionSnapshots(fallback);
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
    for (const blockerReason of normalizeDistinctStringArray(
      snapshot.blockerReasons,
    )) {
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

  const mergedSnapshots = [...snapshotsByCorrelationKey.values()].sort(
    (left, right) => {
      const partitionDelta = String(left.partitionId || "").localeCompare(
        String(right.partitionId || ""),
      );
      if (partitionDelta !== ZERO) {
        return partitionDelta;
      }
      const leftEpoch = Number.isFinite(left.epoch) ? left.epoch : -1;
      const rightEpoch = Number.isFinite(right.epoch) ? right.epoch : -1;
      if (leftEpoch !== rightEpoch) {
        return leftEpoch - rightEpoch;
      }
      return String(left.correlationKey || "").localeCompare(
        String(right.correlationKey || ""),
      );
    },
  );
  const mergedPartitionIdSet = new Set(
    mergedSnapshots.map((snapshot) => snapshot.partitionId),
  );
  const normalizedBlockerPartitionIdsByReason = {};
  for (const [blockerReason, partitionIds] of Object.entries(
    blockerPartitionIdsByReason,
  )) {
    normalizedBlockerPartitionIdsByReason[blockerReason] = [
      ...partitionIds,
    ].sort();
  }
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = [
      ...partitionIds,
    ].sort();
  }

  return {
    schemaVersion:
      normalizedPrimary.schemaVersion ??
      normalizedFallback.schemaVersion ??
      null,
    capturedAt:
      normalizedPrimary.capturedAt || normalizedFallback.capturedAt || null,
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

export const FAILURE_BUNDLE_SEGMENT_1 = {
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
};
