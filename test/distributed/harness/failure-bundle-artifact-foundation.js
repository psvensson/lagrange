import {relative, resolve} from 'node:path';
import {ENTRYPOINT_LOG_MSG} from '../../../src/constants/entrypoint.js';
import {
  JOINING_LOG_MSG,
} from '../../../src/bootstrap/node-joining-constants.js';
import {
  REBALANCE_COORDINATOR_LOG_MSG,
} from '../../../src/rebalancer/rebalancer-constants.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';

export const FAILURE_BUNDLE_SCHEMA_VERSION = 1;
export const FAILURE_BUNDLE_RUN_DIRNAME = 'failure-bundles';
export const FAILURE_BUNDLE_JSON_FILENAME = 'failure-bundle.json';
export const FAILURE_BUNDLE_MARKDOWN_FILENAME = 'failure-bundle.md';
export const TRIAGE_SUMMARY_JSON_FILENAME = 'triage-summary.json';
export const TRIAGE_SUMMARY_MARKDOWN_FILENAME = 'triage-summary.md';
export const RUN_FAILURE_BUNDLE_JSON_FILENAME = 'run-failure-bundle.json';
export const RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME = 'run-failure-bundle.md';
export const LOG_FILE_EXTENSION = '.log';
export const TIMELINE_FILENAME = '_timeline.log';
export const ANALYSIS_FILENAME = '_analysis.json';
export const UTF8_ENCODING = 'utf8';
export const ZERO = 0;
export const ARRAY_LAST_INDEX_OFFSET = 1;
export const LOG_TAIL_LINE_COUNT = 20;
export const MARKDOWN_SECTION_BREAK = '\n\n';
export const UNKNOWN_VALUE = 'unknown';
export const NO_PROGRESS_REASON_CODE = 'stalled_no_progress';
export const READINESS_FAILURE_CLASS_NO_PROGRESS = 'no_progress_terminal';
export const READINESS_FAILURE_GUIDANCE_KIND = Object.freeze({
  NONE: 'none',
  RECOVERABLE_DELAY: 'recoverable_delay',
  BLOCKING_DELAY: 'blocking_delay',
  NO_PROGRESS: 'no_progress',
  DEFAULT: 'default',
});
export const READINESS_FAILURE_GUIDANCE_BY_KIND = Object.freeze({
  [READINESS_FAILURE_GUIDANCE_KIND.NONE]: Object.freeze({
    failureAction: null,
    operatorRecommendation: null,
  }),
  [READINESS_FAILURE_GUIDANCE_KIND.RECOVERABLE_DELAY]: Object.freeze({
    failureAction:
      'Probe delay is recoverable in this path; allow bounded retry.',
    operatorRecommendation:
      'Re-run with reduced startup concurrency and watch snapshot probe latencies.',
  }),
  [READINESS_FAILURE_GUIDANCE_KIND.BLOCKING_DELAY]: Object.freeze({
    failureAction: 'Snapshot/reachability timeout is blocking convergence.',
    operatorRecommendation:
      'Inspect snapshot query latency, admin readiness, and host/network stability before rerun.',
  }),
  [READINESS_FAILURE_GUIDANCE_KIND.NO_PROGRESS]: Object.freeze({
    failureAction:
      'Convergence has stopped progressing within configured guarantees.',
    operatorRecommendation:
      'Inspect publication convergence blockers and topology readiness evidence before retry.',
  }),
  [READINESS_FAILURE_GUIDANCE_KIND.DEFAULT]: Object.freeze({
    failureAction: 'Readiness convergence issue requires triage.',
    operatorRecommendation:
      'Collect active-gate diagnostics and follow triage priorities before rerun.',
  }),
});
export const NODE_DIAGNOSTICS_TRACE_LIMIT = 5;
export const NODE_ID_ERROR_PATTERN = /\bnode=([a-z0-9._:-]+)\b/gi;
export const PLAYBACK_EVENTS_FILENAME = 'events.ndjson';
export const PLAYBACK_SNAPSHOTS_FILENAME = 'snapshots.ndjson';
export const PLAYBACK_EVENT_TYPE_CLUSTER_STAGE = 'cluster.stage';
export const PLAYBACK_EVENT_TYPE_LOAD_STARTED = 'load.started';
export const PLAYBACK_EVENT_TYPE_LOAD_PROGRESS = 'load.progress';
export const PLAYBACK_EVENT_TYPE_LOAD_COMPLETED = 'load.completed';
export const PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY = 'node.restart.boundary';
export const PLAYBACK_EVENT_TYPE_PARTITION_CREATED = 'partition.created';
export const PLAYBACK_EVENT_TYPE_REPLICA_CREATED = 'replica.created';
export const PLAYBACK_EVENT_TYPE_REPLICA_REMOVED = 'replica.removed';
export const PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE =
  'setup.cluster.waiting-active';
export const PLAYBACK_STAGE_LOAD_READINESS_WAITING =
  'scenario.load-readiness.waiting';
export const PLAYBACK_STAGE_LOAD_READINESS_STABLE =
  'scenario.load-readiness.stable';
export const ROOT_CAUSE_CLASS_UNKNOWN = 'unknown';
export const ROOT_CAUSE_CLASS_STARTUP = 'startup';
export const ROOT_CAUSE_CLASS_DISCOVERY = 'discovery';
export const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
export const ROOT_CAUSE_CLASS_LOAD = 'load';
export const ROOT_CAUSE_CLASS_CDC = 'cdc';
export const ROOT_CAUSE_CLASS_CACHE = 'cache';
export const FIRST_FAULT_MARKER_QUEUE_PRESSURE = 'queuePressureOnset';
export const FIRST_FAULT_MARKER_ATTEMPT_ERRORS = 'attemptErrorOnset';
export const FIRST_FAULT_MARKER_HARD_FAILURE = 'hardFailureOnset';
export const LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE = 'nodeSlotUnavailable';
export const LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED = 'nodeAdmissionBlocked';
export const LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE =
  'retryableControlPlanePressure';
export const LOAD_WAIT_REASON_TIMEOUT_WAITS = 'timeoutWaits';
export const LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED = 'queueCapacityRejected';
export const PRIORITY_RECOVERY_PROGRESS_NONE = 'none';
export const PRIORITY_RECOVERY_PROGRESS_REASON_PREFIX = 'priority_recovery';
export const PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK =
  'priority_recovery_progress_blocked';
export const PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
  'priority_partitions_not_spread';
export const PRIORITY_RECOVERY_REASON_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE =
  'priority_spread_evidence_unavailable';
export const PRIORITY_RECOVERY_CLOSURE_WITNESS_PRIORITY_SPREAD_PENDING =
  'publication_converged_priority_spread_pending';
export const PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASON =
  'eligible_but_no_operation_created';
export const PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASONS = Object.freeze([
  PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
]);
export const PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD = Object.freeze({
  CAPTURED_AT: 'capturedAt',
  COMPLETED_AT_MS: 'completedAtMs',
  CREATED_AT_MS: 'createdAtMs',
  LAST_PROGRESS_AT_MS: 'lastProgressAtMs',
  TARGET_SERVICE_PROGRESS_AT_MS: 'targetServiceProgressAtMs',
  UPDATED_AT_MS: 'updatedAtMs',
});
export const PRIORITY_RECOVERY_SPECIFIC_ACTUATION_STATES = Object.freeze([
  PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
  PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_FAILED,
]);
export const READINESS_REASON_MAX_NODES = 25;
export const READINESS_REASON_MAX_PER_NODE = 5;
export const AFFECTED_NODE_ID_LIMIT = 25;
export const FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED =
  'publication_convergence_blocked';
export const FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED = 'startup_recovery_blocked';
export const FAILURE_CLASS_DISCOVERY_UNAVAILABLE = 'discovery_unavailable';
export const FAILURE_CLASS_TOPOLOGY_UNSTABLE = 'topology_unstable';
export const FAILURE_CLASS_LOAD_PRESSURE = 'load_pressure';
export const FAILURE_CLASS_CDC_DEGRADED = 'cdc_degraded';
export const FAILURE_CLASS_CACHE_STALE = 'cache_stale';
export const FAILURE_CLASS_VERIFICATION_MISMATCH = 'verification_mismatch';
export const FAILURE_CLASS_UNKNOWN = 'unknown';
export const FAILURE_CLASS_CONFIDENCE_HIGH = 'high';
export const FAILURE_CLASS_CONFIDENCE_MEDIUM = 'medium';
export const FAILURE_CLASS_CONFIDENCE_LOW = 'low';
export const TRIAGE_CLUSTER_STAGE_LIMIT = 12;
export const TRIAGE_RECENT_TOPOLOGY_EVENT_LIMIT = 10;
export const TRIAGE_TOP_LOAD_NODE_LIMIT = 5;
export const STABILITY_GATE_STATUS_OPEN = 'open';
export const STABILITY_GATE_STATUS_CLOSED = 'closed';
export const STABILITY_GATE_STATUS_NOT_APPLICABLE = 'not_applicable';
export const STABILITY_GATE_STATUS_UNKNOWN = 'unknown';
export const STABILITY_GATE_TYPE_FAILOVER = 'failover';
export const STABILITY_GATE_TYPE_CONVERGENCE = 'convergence';
export const STABILITY_GATE_TYPE_RESTART_RECOVERY = 'restart_recovery';
export const STABILITY_GATE_BLOCKER_PUBLICATION_PENDING = 'publication_pending';
export const STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE =
  'publication_missing_active_node';
export const STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING =
  'priority_spread_pending';
export const STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT = 'pending_acks_present';
export const STABILITY_GATE_BLOCKER_BLOCKED_NODES = 'publication_blocked_nodes';
export const STABILITY_GATE_BLOCKER_CLOSURE_RECORD = 'closure_record';
export const STABILITY_GATE_BLOCKER_STARTUP_READINESS = 'startup_readiness_blocked';
export const STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED =
  'admin_reachability_refused';
export const SCENARIO_NAME_FRAGMENT_RESTART = 'restart';
const DECISION_ARTIFACT_FIELD_PEER_ADDRESSES = 'peerAddresses';
const DECISION_ARTIFACT_FIELD_SEED_NODE_ADDRESSES = 'seedNodeAddresses';
const DECISION_ARTIFACT_FIELD_SEED_CONTACT = 'seedContact';
const DECISION_ARTIFACT_FIELD_SEED_CONTACT_FAILURE_KIND =
  'seedContactFailureKind';
export const DECISION_ARTIFACT_FIELD = Object.freeze({
  ADMIN_PORT: 'adminPort',
  ADMIN_RUNTIME_STARTED: 'adminRuntimeStarted',
  ATTEMPT: 'attempt',
  BOOTSTRAP_API_HAS_MESSAGE_ROUTER: 'bootstrapApiHasMessageRouter',
  BOOTSTRAP_API_HAS_SQL_QUERY_ENGINE: 'bootstrapApiHasSqlQueryEngine',
  BOOTSTRAP_API_HAS_STARTUP_RECOVERY_COORDINATOR:
    'bootstrapApiHasStartupRecoveryCoordinator',
  DURATION: 'duration',
  ERROR: 'error',
  JOIN_SESSION_ID: 'joinSessionId',
  MAX_ATTEMPTS: 'maxAttempts',
  MODE: 'mode',
  NODE_ID: 'nodeId',
  OPERATION_ID: 'operationId',
  PARTITION_ID: 'partitionId',
  PEER_ADDRESS: 'peerAddress',
  PEER_ADDRESSES: DECISION_ARTIFACT_FIELD_PEER_ADDRESSES,
  PHASE: 'phase',
  BOUNDARY: 'boundary',
  DELAY_MS: 'delayMs',
  ERROR_MESSAGE: 'errorMessage',
  RETRY_AFTER_MS: 'retryAfterMs',
  SEED_NODE_ADDRESS: 'seedNodeAddress',
  SEED_NODE_ADDRESSES: DECISION_ARTIFACT_FIELD_SEED_NODE_ADDRESSES,
  SEED_CONTACT: DECISION_ARTIFACT_FIELD_SEED_CONTACT,
  SEED_CONTACT_FAILURE_KIND: DECISION_ARTIFACT_FIELD_SEED_CONTACT_FAILURE_KIND,
  SOURCE: 'source',
  STARTUP_BRANCH: 'startupBranch',
  STARTUP_MODE: 'startupMode',
  STARTUP_PHASE: 'startupPhase',
  STATE: 'state',
  SUB_PHASE: 'subPhase',
  TARGET_NODE_ID: 'targetNodeId',
  WORKFLOW_STEP: 'workflowStep',
  TRANSPORT_DELIVERY_STATE: 'transportDeliveryState',
  TRANSPORT_REASON_CODE: 'transportReasonCode',
  TARGET_CONNECTION_PRESENT: 'targetConnectionPresent',
  TARGET_CONNECTION_STATE: 'targetConnectionState',
  TARGET_CONNECTION_IS_INCOMING: 'targetConnectionIsIncoming',
  TARGET_CONNECTION_ADDRESS: 'targetConnectionAddress',
  TARGET_CONNECTION_ID: 'targetConnectionId',
  TARGET_CONNECTION_HAS_ADDRESS: 'targetConnectionHasAddress',
  TARGET_CONNECTION_HAS_SCHEDULED_RECONNECT:
    'targetConnectionHasScheduledReconnect',
  TARGET_ACK_TIMEOUT_STREAK: 'targetAckTimeoutStreak',
  TARGET_RECONNECT_ATTEMPTS: 'targetReconnectAttempts',
  TARGET_LAST_ACK_AT: 'targetLastAckAt',
  TARGET_LAST_ACK_TIMEOUT_AT: 'targetLastAckTimeoutAt',
  ACTIVE_RETRIES_PER_TARGET: 'activeRetriesPerTarget',
  MAX_ACTIVE_RETRIES_PER_TARGET: 'maxActiveRetriesPerTarget',
});
export const AUTO_REJOIN_DECISION_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.MODE,
  DECISION_ARTIFACT_FIELD.SOURCE,
  DECISION_ARTIFACT_FIELD.STARTUP_MODE,
  DECISION_ARTIFACT_FIELD.PEER_ADDRESS,
  DECISION_ARTIFACT_FIELD.PEER_ADDRESSES,
]);
export const JOINING_CLUSTER_DECISION_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.SEED_NODE_ADDRESS,
  DECISION_ARTIFACT_FIELD.SEED_NODE_ADDRESSES,
  DECISION_ARTIFACT_FIELD.STARTUP_MODE,
]);
export const STARTUP_RUNTIME_HANDOFF_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.STARTUP_BRANCH,
  DECISION_ARTIFACT_FIELD.STARTUP_PHASE,
  DECISION_ARTIFACT_FIELD.BOOTSTRAP_API_HAS_SQL_QUERY_ENGINE,
  DECISION_ARTIFACT_FIELD.BOOTSTRAP_API_HAS_MESSAGE_ROUTER,
  DECISION_ARTIFACT_FIELD.BOOTSTRAP_API_HAS_STARTUP_RECOVERY_COORDINATOR,
  DECISION_ARTIFACT_FIELD.ADMIN_RUNTIME_STARTED,
  DECISION_ARTIFACT_FIELD.ADMIN_PORT,
]);
export const JOIN_PHASE_FAILURE_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.STATE,
  DECISION_ARTIFACT_FIELD.PHASE,
  DECISION_ARTIFACT_FIELD.SUB_PHASE,
  DECISION_ARTIFACT_FIELD.DURATION,
  DECISION_ARTIFACT_FIELD.ERROR,
  DECISION_ARTIFACT_FIELD.SEED_CONTACT_FAILURE_KIND,
  DECISION_ARTIFACT_FIELD.SEED_CONTACT,
]);
export const RETRYABLE_JOIN_RESUME_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.JOIN_SESSION_ID,
  DECISION_ARTIFACT_FIELD.ATTEMPT,
  DECISION_ARTIFACT_FIELD.MAX_ATTEMPTS,
  DECISION_ARTIFACT_FIELD.RETRY_AFTER_MS,
  DECISION_ARTIFACT_FIELD.PHASE,
  DECISION_ARTIFACT_FIELD.ERROR,
]);
export const OPERATION_DISPATCH_RETRY_DEFERRAL_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.OPERATION_ID,
  DECISION_ARTIFACT_FIELD.PARTITION_ID,
  DECISION_ARTIFACT_FIELD.TARGET_NODE_ID,
  DECISION_ARTIFACT_FIELD.WORKFLOW_STEP,
  DECISION_ARTIFACT_FIELD.DELAY_MS,
  DECISION_ARTIFACT_FIELD.ERROR_MESSAGE,
  DECISION_ARTIFACT_FIELD.BOUNDARY,
  DECISION_ARTIFACT_FIELD.TRANSPORT_DELIVERY_STATE,
  DECISION_ARTIFACT_FIELD.TRANSPORT_REASON_CODE,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_PRESENT,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_STATE,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_IS_INCOMING,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_ADDRESS,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_ID,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_HAS_ADDRESS,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_HAS_SCHEDULED_RECONNECT,
  DECISION_ARTIFACT_FIELD.TARGET_ACK_TIMEOUT_STREAK,
  DECISION_ARTIFACT_FIELD.TARGET_RECONNECT_ATTEMPTS,
  DECISION_ARTIFACT_FIELD.TARGET_LAST_ACK_AT,
  DECISION_ARTIFACT_FIELD.TARGET_LAST_ACK_TIMEOUT_AT,
]);

export const OPERATION_DISPATCH_RETRY_SHED_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.OPERATION_ID,
  DECISION_ARTIFACT_FIELD.PARTITION_ID,
  DECISION_ARTIFACT_FIELD.TARGET_NODE_ID,
  DECISION_ARTIFACT_FIELD.WORKFLOW_STEP,
  DECISION_ARTIFACT_FIELD.BOUNDARY,
  DECISION_ARTIFACT_FIELD.ACTIVE_RETRIES_PER_TARGET,
  DECISION_ARTIFACT_FIELD.MAX_ACTIVE_RETRIES_PER_TARGET,
  DECISION_ARTIFACT_FIELD.TRANSPORT_DELIVERY_STATE,
  DECISION_ARTIFACT_FIELD.TRANSPORT_REASON_CODE,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_PRESENT,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_STATE,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_IS_INCOMING,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_ADDRESS,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_ID,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_HAS_ADDRESS,
  DECISION_ARTIFACT_FIELD.TARGET_CONNECTION_HAS_SCHEDULED_RECONNECT,
  DECISION_ARTIFACT_FIELD.TARGET_ACK_TIMEOUT_STREAK,
  DECISION_ARTIFACT_FIELD.TARGET_RECONNECT_ATTEMPTS,
  DECISION_ARTIFACT_FIELD.TARGET_LAST_ACK_AT,
  DECISION_ARTIFACT_FIELD.TARGET_LAST_ACK_TIMEOUT_AT,
]);

export const LOAD_WAIT_REASON_KEYS = Object.freeze([
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED,
  LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
  LOAD_WAIT_REASON_TIMEOUT_WAITS,
  LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED,
]);

export const LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON = Object.freeze({
  [LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE]: ROOT_CAUSE_CLASS_LOAD,
  [LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED]: ROOT_CAUSE_CLASS_LOAD,
  [LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE]:
    ROOT_CAUSE_CLASS_DISCOVERY,
  [LOAD_WAIT_REASON_TIMEOUT_WAITS]: ROOT_CAUSE_CLASS_LOAD,
  [LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED]: ROOT_CAUSE_CLASS_LOAD,
});

export function toWorkspaceRelative(targetPath, workspaceRoot = process.cwd()) {
  if (typeof targetPath !== 'string' || targetPath.length === ZERO) {
    return null;
  }
  return relative(workspaceRoot, resolve(targetPath));
}

export function sanitizePathSegment(value, fallback = UNKNOWN_VALUE) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > ZERO ? normalized : fallback;
}

export function sliceLogTail(logContent, maxLines = LOG_TAIL_LINE_COUNT) {
  const lines = String(logContent || '')
    .split('\n')
    .filter((line) => line.length > ZERO);
  return lines.slice(-Math.max(1, maxLines));
}

export function parseStructuredLogLine(line) {
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

export function resolveStructuredLogMessage(parsed) {
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

export function resolveStructuredLogTimestamp(parsed) {
  if (typeof parsed?.time === 'string' && parsed.time.length > ZERO) {
    return parsed.time;
  }
  if (typeof parsed?.timestamp === 'string' && parsed.timestamp.length > ZERO) {
    return parsed.timestamp;
  }
  return null;
}

export function sanitizeStructuredDecisionArtifact(parsed, fields) {
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

export function resolveDecisionArtifactTimestampMs(artifact = null) {
  const timestampMs = Date.parse(artifact?.timestamp);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

export function isDecisionArtifactCurrentForBoundary(
  artifact = null,
  boundaryTimestampMs = null,
) {
  const artifactTimestampMs = resolveDecisionArtifactTimestampMs(artifact);
  return boundaryTimestampMs === null ||
    artifactTimestampMs === null ||
    artifactTimestampMs >= boundaryTimestampMs;
}

export function filterDecisionArtifactsAtOrAfterBoundary(
  artifacts = [],
  boundaryArtifact = null,
) {
  const boundaryTimestampMs =
    resolveDecisionArtifactTimestampMs(boundaryArtifact);
  return boundaryTimestampMs === null ?
    artifacts :
    artifacts.filter((artifact) =>
      isDecisionArtifactCurrentForBoundary(artifact, boundaryTimestampMs),
    );
}

export function resolveLatestDecisionArtifact(artifacts = []) {
  return artifacts.length > ZERO ?
    artifacts[artifacts.length - ARRAY_LAST_INDEX_OFFSET] :
    null;
}

export function extractDecisionArtifactsFromLogContent(content) {
  const startupDecisions = [];
  const runtimeHandoffs = [];
  const startupFailures = [];
  const retryableJoinResumes = [];
  const operationDispatchRetryDeferrals = [];
  const operationDispatchRetrySheds = [];
  const lines = String(content || '').split('\n');
  for (const line of lines) {
    const parsed = parseStructuredLogLine(line);
    if (!parsed) {
      continue;
    }
    const message = resolveStructuredLogMessage(parsed);
    if (message === ENTRYPOINT_LOG_MSG.AUTO_REJOIN_DECISION) {
      startupDecisions.push(
        sanitizeStructuredDecisionArtifact(
          parsed,
          AUTO_REJOIN_DECISION_ARTIFACT_FIELDS,
        ),
      );
      continue;
    }
    if (message === ENTRYPOINT_LOG_MSG.JOINING_CLUSTER) {
      startupDecisions.push(
        sanitizeStructuredDecisionArtifact(
          parsed,
          JOINING_CLUSTER_DECISION_ARTIFACT_FIELDS,
        ),
      );
      continue;
    }
    if (message === ENTRYPOINT_LOG_MSG.STARTUP_RUNTIME_HANDOFF) {
      runtimeHandoffs.push(
        sanitizeStructuredDecisionArtifact(
          parsed,
          STARTUP_RUNTIME_HANDOFF_ARTIFACT_FIELDS,
        ),
      );
      continue;
    }
    if (message === JOINING_LOG_MSG.PHASE_FAILED) {
      startupFailures.push(
        sanitizeStructuredDecisionArtifact(
          parsed,
          JOIN_PHASE_FAILURE_ARTIFACT_FIELDS,
        ),
      );
      continue;
    }
    if (message === JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUMING) {
      retryableJoinResumes.push(
        sanitizeStructuredDecisionArtifact(
          parsed,
          RETRYABLE_JOIN_RESUME_ARTIFACT_FIELDS,
        ),
      );
      continue;
    }
    if (
      message === REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED
    ) {
      operationDispatchRetryDeferrals.push(
        sanitizeStructuredDecisionArtifact(
          parsed,
          OPERATION_DISPATCH_RETRY_DEFERRAL_ARTIFACT_FIELDS,
        ),
      );
      continue;
    }
    if (
      message === REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_SHED
    ) {
      operationDispatchRetrySheds.push(
        sanitizeStructuredDecisionArtifact(
          parsed,
          OPERATION_DISPATCH_RETRY_SHED_ARTIFACT_FIELDS,
        ),
      );
    }
  }
  if (
    startupDecisions.length === ZERO &&
    runtimeHandoffs.length === ZERO &&
    startupFailures.length === ZERO &&
    retryableJoinResumes.length === ZERO &&
    operationDispatchRetryDeferrals.length === ZERO &&
    operationDispatchRetrySheds.length === ZERO
  ) {
    return null;
  }
  const normalizedStartupDecisions = startupDecisions.filter(Boolean);
  const normalizedRuntimeHandoffs = runtimeHandoffs.filter(Boolean);
  const normalizedOperationDispatchRetryDeferrals =
    operationDispatchRetryDeferrals.filter(Boolean);
  const normalizedOperationDispatchRetrySheds =
    operationDispatchRetrySheds.filter(Boolean);
  const latestStartupDecision = resolveLatestDecisionArtifact(
    normalizedStartupDecisions,
  );
  const currentStartupFailures = filterDecisionArtifactsAtOrAfterBoundary(
    startupFailures.filter(Boolean),
    latestStartupDecision,
  );
  const currentRetryableJoinResumes = filterDecisionArtifactsAtOrAfterBoundary(
    retryableJoinResumes.filter(Boolean),
    latestStartupDecision,
  );
  return {
    startupDecisions: normalizedStartupDecisions,
    runtimeHandoffs: normalizedRuntimeHandoffs,
    startupFailures: currentStartupFailures,
    retryableJoinResumes: currentRetryableJoinResumes,
    operationDispatchRetryDeferrals:
      normalizedOperationDispatchRetryDeferrals,
    operationDispatchRetrySheds: normalizedOperationDispatchRetrySheds,
    latestStartupDecision,
    latestRuntimeHandoff: resolveLatestDecisionArtifact(
      normalizedRuntimeHandoffs,
    ),
    latestStartupFailure: resolveLatestDecisionArtifact(currentStartupFailures),
    latestRetryableJoinResume: resolveLatestDecisionArtifact(
      currentRetryableJoinResumes,
    ),
    latestOperationDispatchRetryDeferral: resolveLatestDecisionArtifact(
      normalizedOperationDispatchRetryDeferrals,
    ),
    latestOperationDispatchRetryShed: resolveLatestDecisionArtifact(
      normalizedOperationDispatchRetrySheds,
    ),
  };
}

export function resolveRoutingDiagnostics(logExcerpt) {
  for (const line of [
    ...(Array.isArray(logExcerpt) ? logExcerpt : []),
  ].reverse()) {
    const parsed = parseStructuredLogLine(line);
    if (
      !parsed ||
      parsed.subsystem !== 'query-executor' ||
      !parsed.routingSnapshot ||
      typeof parsed.routingSnapshot !== 'object'
    ) {
      continue;
    }
    return parsed.routingSnapshot;
  }
  return null;
}

export function resolveFailureDiagnostics(entry) {
  const diagnostics = entry?.details?.diagnostics;
  return diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
}

export function cloneJsonValue(value) {
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

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeNonNegativeCount(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return Math.max(ZERO, Math.floor(numericValue));
}

export function addNormalizedReasonCount(reasonCounts, reason, count = 1) {
  const normalizedReason = String(reason || '').trim();
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

export function resolveCanonicalFailedOperationCount(metrics) {
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

export function resolveFailureReasonCounts(entry, fallbackReasonCounts = null) {
  const reasonCounts = resolveFailureDiagnostics(entry)?.failure?.reasonCounts;
  if (reasonCounts && typeof reasonCounts === 'object') {
    return reasonCounts;
  }
  if (fallbackReasonCounts && typeof fallbackReasonCounts === 'object') {
    return fallbackReasonCounts;
  }
  return {};
}

export function buildTopReasonCounts(reasonCounts, limit = 5) {
  return Object.entries(reasonCounts)
    .map(([reason, count]) => ({
      reason: String(reason),
      count: Number(count || ZERO),
    }))
    .filter((entry) => Number.isFinite(entry.count) && entry.count > ZERO)
    .sort((left, right) => right.count - left.count)
    .slice(ZERO, limit);
}

// Census run2 rank5: nodeSlotUnavailable is a pure harness construct (zero src/ references;
// load-generator.js maps both SLOT_SATURATED and SLOT_STALLED onto it) and is never a real
// cluster blocker, yet with a floorless top-count pick a single nodeSlotUnavailable=1 over a
// HEALTHY cluster won dominantReason and RELABELLED a CLASS-2 recovery-settle failure as a
// load/placement problem. It is treated as non-binding: reportable only when NO real reason is
// present. NOTE scoped to nodeSlotUnavailable ONLY — the other LOAD_WAIT reasons (e.g.
// nodeAdmissionBlocked) are legitimate dominant reasons in genuine load-pressure scenarios.
const NON_BINDING_DOMINANT_REASONS = new Set([
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
]);

export function buildDominantReason(reasonCounts) {
  // Sorted by count desc; find the highest-count BINDING (non-load-wait) reason first, so a
  // real settle/recovery reason is never relabelled by a load-wait artifact regardless of
  // count. Fall back to the top reason only when every reason is a non-binding artifact, so a
  // diagnostic label is never lost.
  const topReasons = buildTopReasonCounts(reasonCounts, Number.MAX_SAFE_INTEGER);
  if (topReasons.length === ZERO) {
    return null;
  }
  const bindingReason = topReasons.find(
    (entry) => !NON_BINDING_DOMINANT_REASONS.has(entry.reason),
  );
  return (bindingReason || topReasons[ZERO]).reason;
}

export function mergeReasonCounts(...entries) {
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

export function normalizeDistinctStringArray(values) {
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
