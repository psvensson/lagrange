import {relative, resolve} from 'node:path';
import {ENTRYPOINT_LOG_MSG} from '../../../src/constants/entrypoint.js';
import {
  JOINING_LOG_MSG,
} from '../../../src/bootstrap/node-joining-constants.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from '../../../src/control-plane/membership-lifecycle-constants.js';
import {buildPriorityRecoveryClosureWitness} from '../../../src/control-plane/priority-recovery-snapshot.js';
import {classifyActiveGateClosureWitness} from './active-gate-closure-classification.js';
import {normalizePriorityRecoveryActiveGateSnapshot} from './active-gate-contract.js';
import {buildCanonicalPublicationEvidenceFromControlPlane} from
  './publication-evidence-contract.js';
import {
  buildPriorityRecoveryProgressSummary,
  hasMeaningfulPriorityRecoveryProgressWitness,
  normalizePriorityPartitionSummaryForDiagnostics,
  normalizePriorityRecoveryPartitionWitnessesForDiagnostics,
} from './priority-recovery-summary-normalization.js';
import {
  ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE,
  ACTIVE_GATE_READINESS_DELAY_CAUSE_REACHABILITY_TIMEOUT,
  ACTIVE_GATE_READINESS_DELAY_CAUSE_SNAPSHOT_TIMEOUT,
  ACTIVE_GATE_READINESS_DELAY_RECOVERABILITY_RECOVERABLE,
} from './startup-readiness-evidence.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
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
const ARRAY_LAST_INDEX_OFFSET = 1;
const LOG_TAIL_LINE_COUNT = 20;
const MARKDOWN_SECTION_BREAK = '\n\n';
const UNKNOWN_VALUE = 'unknown';
const NO_PROGRESS_REASON_CODE = 'stalled_no_progress';
const READINESS_FAILURE_CLASS_NO_PROGRESS = 'no_progress_terminal';
const NODE_DIAGNOSTICS_TRACE_LIMIT = 5;
const NODE_ID_ERROR_PATTERN = /\bnode=([a-z0-9._:-]+)\b/gi;
const PLAYBACK_EVENTS_FILENAME = 'events.ndjson';
const PLAYBACK_SNAPSHOTS_FILENAME = 'snapshots.ndjson';
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
const PLAYBACK_STAGE_LOAD_READINESS_WAITING =
  'scenario.load-readiness.waiting';
const PLAYBACK_STAGE_LOAD_READINESS_STABLE =
  'scenario.load-readiness.stable';
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
const PRIORITY_RECOVERY_PROGRESS_NONE = 'none';
const PRIORITY_RECOVERY_PROGRESS_REASON_PREFIX = 'priority_recovery';
const PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK =
  'priority_recovery_progress_blocked';
const PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
  'priority_partitions_not_spread';
const PRIORITY_RECOVERY_REASON_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE =
  'priority_spread_evidence_unavailable';
const PRIORITY_RECOVERY_CLOSURE_WITNESS_PRIORITY_SPREAD_PENDING =
  'publication_converged_priority_spread_pending';
const PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASON =
  'eligible_but_no_operation_created';
const PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASONS = Object.freeze([
  PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
]);
const PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD = Object.freeze({
  CAPTURED_AT: 'capturedAt',
  COMPLETED_AT_MS: 'completedAtMs',
  CREATED_AT_MS: 'createdAtMs',
  LAST_PROGRESS_AT_MS: 'lastProgressAtMs',
  TARGET_SERVICE_PROGRESS_AT_MS: 'targetServiceProgressAtMs',
  UPDATED_AT_MS: 'updatedAtMs',
});
const PRIORITY_RECOVERY_SPECIFIC_ACTUATION_STATES = Object.freeze([
  PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
  PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_FAILED,
]);
const READINESS_REASON_MAX_NODES = 25;
const READINESS_REASON_MAX_PER_NODE = 5;
const AFFECTED_NODE_ID_LIMIT = 25;
const FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED =
  'publication_convergence_blocked';
const FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED = 'startup_recovery_blocked';
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
const STABILITY_GATE_STATUS_OPEN = 'open';
const STABILITY_GATE_STATUS_CLOSED = 'closed';
const STABILITY_GATE_STATUS_NOT_APPLICABLE = 'not_applicable';
const STABILITY_GATE_STATUS_UNKNOWN = 'unknown';
const STABILITY_GATE_TYPE_FAILOVER = 'failover';
const STABILITY_GATE_TYPE_CONVERGENCE = 'convergence';
const STABILITY_GATE_TYPE_RESTART_RECOVERY = 'restart_recovery';
const STABILITY_GATE_BLOCKER_PUBLICATION_PENDING = 'publication_pending';
const STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE =
  'publication_missing_active_node';
const STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING =
  'priority_spread_pending';
const STABILITY_GATE_BLOCKER_PENDING_ACK_NODES = 'pending_ack_nodes';
const STABILITY_GATE_BLOCKER_BLOCKED_NODES = 'publication_blocked_nodes';
const STABILITY_GATE_BLOCKER_CLOSURE_RECORD = 'closure_record';
const STABILITY_GATE_BLOCKER_STARTUP_READINESS = 'startup_readiness_blocked';
const STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED =
  'admin_reachability_refused';
const SCENARIO_NAME_FRAGMENT_RESTART = 'restart';
const DECISION_ARTIFACT_FIELD = Object.freeze({
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
  PEER_ADDRESS: 'peerAddress',
  PHASE: 'phase',
  RETRY_AFTER_MS: 'retryAfterMs',
  SEED_NODE_ADDRESS: 'seedNodeAddress',
  SOURCE: 'source',
  STARTUP_BRANCH: 'startupBranch',
  STARTUP_MODE: 'startupMode',
  STARTUP_PHASE: 'startupPhase',
  STATE: 'state',
  SUB_PHASE: 'subPhase',
});
const AUTO_REJOIN_DECISION_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.MODE,
  DECISION_ARTIFACT_FIELD.SOURCE,
  DECISION_ARTIFACT_FIELD.STARTUP_MODE,
  DECISION_ARTIFACT_FIELD.PEER_ADDRESS,
]);
const JOINING_CLUSTER_DECISION_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.SEED_NODE_ADDRESS,
  DECISION_ARTIFACT_FIELD.STARTUP_MODE,
]);
const STARTUP_RUNTIME_HANDOFF_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.STARTUP_BRANCH,
  DECISION_ARTIFACT_FIELD.STARTUP_PHASE,
  DECISION_ARTIFACT_FIELD.BOOTSTRAP_API_HAS_SQL_QUERY_ENGINE,
  DECISION_ARTIFACT_FIELD.BOOTSTRAP_API_HAS_MESSAGE_ROUTER,
  DECISION_ARTIFACT_FIELD.BOOTSTRAP_API_HAS_STARTUP_RECOVERY_COORDINATOR,
  DECISION_ARTIFACT_FIELD.ADMIN_RUNTIME_STARTED,
  DECISION_ARTIFACT_FIELD.ADMIN_PORT,
]);
const JOIN_PHASE_FAILURE_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.STATE,
  DECISION_ARTIFACT_FIELD.PHASE,
  DECISION_ARTIFACT_FIELD.SUB_PHASE,
  DECISION_ARTIFACT_FIELD.DURATION,
  DECISION_ARTIFACT_FIELD.ERROR,
]);
const RETRYABLE_JOIN_RESUME_ARTIFACT_FIELDS = Object.freeze([
  DECISION_ARTIFACT_FIELD.NODE_ID,
  DECISION_ARTIFACT_FIELD.JOIN_SESSION_ID,
  DECISION_ARTIFACT_FIELD.ATTEMPT,
  DECISION_ARTIFACT_FIELD.MAX_ATTEMPTS,
  DECISION_ARTIFACT_FIELD.RETRY_AFTER_MS,
  DECISION_ARTIFACT_FIELD.PHASE,
  DECISION_ARTIFACT_FIELD.ERROR,
]);

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

function resolveDecisionArtifactTimestampMs(artifact = null) {
  const timestampMs = Date.parse(artifact?.timestamp);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function isDecisionArtifactCurrentForBoundary(
  artifact = null,
  boundaryTimestampMs = null,
) {
  const artifactTimestampMs = resolveDecisionArtifactTimestampMs(artifact);
  return boundaryTimestampMs === null ||
    artifactTimestampMs === null ||
    artifactTimestampMs >= boundaryTimestampMs;
}

function filterDecisionArtifactsAtOrAfterBoundary(
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

function resolveLatestDecisionArtifact(artifacts = []) {
  return artifacts.length > ZERO ?
    artifacts[artifacts.length - ARRAY_LAST_INDEX_OFFSET] :
    null;
}

function extractDecisionArtifactsFromLogContent(content) {
  const startupDecisions = [];
  const runtimeHandoffs = [];
  const startupFailures = [];
  const retryableJoinResumes = [];
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
    }
  }
  if (
    startupDecisions.length === ZERO &&
    runtimeHandoffs.length === ZERO &&
    startupFailures.length === ZERO &&
    retryableJoinResumes.length === ZERO
  ) {
    return null;
  }
  const normalizedStartupDecisions = startupDecisions.filter(Boolean);
  const normalizedRuntimeHandoffs = runtimeHandoffs.filter(Boolean);
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
    latestStartupDecision,
    latestRuntimeHandoff: resolveLatestDecisionArtifact(
      normalizedRuntimeHandoffs,
    ),
    latestStartupFailure: resolveLatestDecisionArtifact(currentStartupFailures),
    latestRetryableJoinResume: resolveLatestDecisionArtifact(
      currentRetryableJoinResumes,
    ),
  };
}

function resolveRoutingDiagnostics(logExcerpt) {
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

function resolveFailureDiagnostics(entry) {
  const diagnostics = entry?.details?.diagnostics;
  return diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
}

function addNormalizedReasonCount(reasonCounts, reason, count = 1) {
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

function resolvePublicationConvergenceGateReasonCodes(
  publicationConvergenceGate = null,
) {
  const rawReasonCodes = Array.isArray(publicationConvergenceGate?.reasonCodes) ?
    publicationConvergenceGate.reasonCodes :
    Array.isArray(publicationConvergenceGate?.reasons) ?
      publicationConvergenceGate.reasons :
      [];
  return rawReasonCodes
    .map((reason) => String(reason || '').trim())
    .filter((reason) => reason.length > ZERO);
}

function shouldSuppressGateReasonForActivePrioritySpread({
  reason,
  priorityRecoveryReasonCodes,
  prioritySpreadPending,
}) {
  return (
    prioritySpreadPending === true &&
    reason === PRIORITY_RECOVERY_REASON_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE &&
    priorityRecoveryReasonCodes.includes(
      PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
    )
  );
}

function resolveDominantPublicationConvergenceGateReasons({
  publicationConvergenceGateReasons,
  priorityRecoveryReasonCodes,
  prioritySpreadPending,
}) {
  return normalizeDistinctStringArray(publicationConvergenceGateReasons).filter(
    (reason) =>
      !shouldSuppressGateReasonForActivePrioritySpread({
        reason,
        priorityRecoveryReasonCodes,
        prioritySpreadPending,
      }),
  );
}

function isPrioritySpreadSummarySatisfied(summary) {
  return isRecord(summary) && summary.satisfied === true;
}

function resolvePublicationConvergencePendingAckNodeIds(
  publicationDetails = null,
  publicationConvergenceGate = null,
) {
  if (Array.isArray(publicationDetails?.pendingAckNodeIds)) {
    return publicationDetails.pendingAckNodeIds;
  }
  if (Array.isArray(publicationConvergenceGate?.pendingAckNodeIds)) {
    return publicationConvergenceGate.pendingAckNodeIds;
  }
  return [];
}

function isMeaningfulPriorityRecoveryProgressValue(value) {
  return (
    typeof value === 'string' &&
    value.length > ZERO &&
    value !== PRIORITY_RECOVERY_PROGRESS_NONE &&
    value !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.UNAVAILABLE
  );
}

function buildPriorityRecoveryProgressDominantReason(progressSummary = null) {
  const dominantWitness =
    progressSummary?.dominantWitness &&
    typeof progressSummary.dominantWitness === 'object' ?
      progressSummary.dominantWitness :
      null;
  if (!hasMeaningfulPriorityRecoveryProgressWitness(dominantWitness)) {
    return null;
  }
  const reasonParts = [PRIORITY_RECOVERY_PROGRESS_REASON_PREFIX];
  if (isMeaningfulPriorityRecoveryProgressValue(dominantWitness.blockingBoundary)) {
    reasonParts.push(dominantWitness.blockingBoundary);
  } else if (
    isMeaningfulPriorityRecoveryProgressValue(dominantWitness.currentOwner)
  ) {
    reasonParts.push(dominantWitness.currentOwner);
  }
  if (
    isMeaningfulPriorityRecoveryProgressValue(dominantWitness.actuationState) &&
    PRIORITY_RECOVERY_SPECIFIC_ACTUATION_STATES.includes(
      dominantWitness.actuationState,
    )
  ) {
    reasonParts.push(dominantWitness.actuationState);
  } else if (
    isMeaningfulPriorityRecoveryProgressValue(dominantWitness.waitMode)
  ) {
    reasonParts.push(dominantWitness.waitMode);
  } else if (
    isMeaningfulPriorityRecoveryProgressValue(dominantWitness.nextRequiredAction)
  ) {
    reasonParts.push(dominantWitness.nextRequiredAction);
  }
  return reasonParts.length > 1 ?
    reasonParts.join('_') :
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK;
}

function addPriorityRecoveryProgressReasonCounts(
  reasonCounts,
  progressSummary = null,
) {
  if (!isRecord(reasonCounts) || !isRecord(progressSummary)) {
    return null;
  }
  const dominantReason =
    buildPriorityRecoveryProgressDominantReason(progressSummary);
  if (!dominantReason) {
    return null;
  }
  addNormalizedReasonCount(reasonCounts, dominantReason, 1);
  const countMaps = [
    ['actuation_state', progressSummary.actuationStateCounts],
    ['owner', progressSummary.currentOwnerCounts],
    ['blocking_boundary', progressSummary.blockingBoundaryCounts],
    ['wait_mode', progressSummary.waitModeCounts],
    ['next_action', progressSummary.nextRequiredActionCounts],
    ['contract_state', progressSummary.progressContractStateCounts],
    ['pressure_state', progressSummary.pressureStateCounts],
  ];
  for (const [prefix, counts] of countMaps) {
    if (!isRecord(counts)) {
      continue;
    }
    for (const [value, count] of Object.entries(counts)) {
      addNormalizedReasonCount(
        reasonCounts,
        `${PRIORITY_RECOVERY_PROGRESS_REASON_PREFIX}_${prefix}_${value}`,
        count,
      );
    }
  }
  addNormalizedReasonCount(
    reasonCounts,
    'priority_recovery_progress_partition',
    progressSummary.partitionCount || ZERO,
  );
  return dominantReason;
}

function deriveReasonCountsFromPublicationConvergence(controlPlane = null) {
  const publicationEvidence =
    buildCanonicalPublicationEvidenceFromControlPlane(controlPlane);
  const publicationDetails = publicationEvidence.publicationConvergence;
  const publicationConvergenceGate =
    publicationEvidence.publicationConvergenceGate;
  const priorityRecoveryObservation =
    publicationEvidence.priorityRecoveryObservation;
  const pendingAckNodeIds = resolvePublicationConvergencePendingAckNodeIds(
    publicationDetails,
    publicationConvergenceGate,
  );
  const blockedNodeIds = [];
  const blockingReasonCounts = {};
  for (const [nodeId, readiness] of Object.entries(
    controlPlane?.readinessByNodeId || {},
  )) {
    const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
    const reasonCodes = reasons
      .map((reason) => String(reason?.code || '').trim())
      .filter((reason) => reason.length > ZERO);
    const publicationReasons = reasonCodes.filter(
      (reason) =>
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
  const publicationConvergenceGateReasons =
    resolvePublicationConvergenceGateReasonCodes(publicationConvergenceGate);
  const recoveryProtocolState =
    typeof priorityRecoveryObservation?.recoveryProtocolState === 'string' ?
      priorityRecoveryObservation.recoveryProtocolState :
      typeof publicationConvergenceGate?.recoveryProtocolState === 'string' ?
        publicationConvergenceGate.recoveryProtocolState :
        typeof publicationDetails?.recoveryProtocolState === 'string' ?
          publicationDetails.recoveryProtocolState :
          typeof publicationDetails?.membershipLifecycleSummary
            ?.recoveryProtocolState === 'string' ?
            publicationDetails.membershipLifecycleSummary.recoveryProtocolState :
            null;
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      publicationConvergenceGate?.reasonCodes ??
      publicationConvergenceGate?.reasons ??
      publicationDetails?.priorityRecoveryReasonCodes ??
      publicationDetails?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      publicationDetails?.membershipLifecycleSummary
        ?.recoveryProtocolReasonCodes,
  );
  const priorityPartitionSummary = normalizePriorityPartitionSummaryForDiagnostics(
    priorityRecoveryObservation?.priorityPartitionSummary ??
      publicationDetails?.priorityPartitionSummary ??
      publicationConvergenceGate?.priorityPartitionSummary ??
      null,
  );
  const prioritySpreadSatisfied = isPrioritySpreadSummarySatisfied(
    priorityPartitionSummary,
  );
  const hasPrioritySpreadReason =
    priorityRecoveryReasonCodes.includes(
      PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
    );
  const prioritySpreadPending =
    prioritySpreadSatisfied !== true &&
    (
      priorityRecoveryObservation?.prioritySpreadPending === true ||
      publicationConvergenceGate?.prioritySpreadPending === true ||
      publicationDetails?.prioritySpreadPending === true ||
      (
        recoveryProtocolState ===
          RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING &&
        hasPrioritySpreadReason
      )
    );
  const publicationPending =
    priorityRecoveryObservation?.publicationPending === true ||
    publicationConvergenceGate?.publicationPending === true ||
    publicationDetails?.publicationPending === true;
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate: controlPlane?.activeGate || null,
    activeGateProgress: controlPlane?.activeGateProgress || null,
    activeGateBestProgress: controlPlane?.activeGateBestProgress || null,
    activeGateNoProgress: controlPlane?.activeGateNoProgress || null,
    activeGateBlockerHistory: controlPlane?.activeGateBlockerHistory || null,
    activeGateAdmissionState: controlPlane?.activeGateAdmissionState || null,
  });
  const activeGateProgress =
    activeGate?.progress ||
    (controlPlane?.activeGateProgress &&
    typeof controlPlane.activeGateProgress === 'object' ?
      controlPlane.activeGateProgress :
      null);
  const activeGateBestProgress =
    activeGate?.bestProgress ||
    (controlPlane?.activeGateBestProgress &&
    typeof controlPlane.activeGateBestProgress === 'object' ?
      controlPlane.activeGateBestProgress :
      null);
  const activeGateNoProgress =
    controlPlane?.activeGateNoProgress &&
    typeof controlPlane.activeGateNoProgress === 'object' ?
      controlPlane.activeGateNoProgress :
      null;
  const activeGateSnapshotCoverage =
    controlPlane?.activeGateSnapshotCoverage &&
    typeof controlPlane.activeGateSnapshotCoverage === 'object' ?
      controlPlane.activeGateSnapshotCoverage :
      null;
  const closureProgressSnapshot =
    activeGateProgress ||
    activeGateBestProgress ||
    activeGateNoProgress?.currentProgress ||
    (activeGateSnapshotCoverage ?
      {
        snapshotCoverageComplete:
            activeGateSnapshotCoverage.completeCoverage === true,
        publicationStatus:
            publicationDetails?.publicationStatus ||
            publicationConvergenceGate?.publicationStatus ||
            activeGateSnapshotCoverage?.selectedPublicationConvergence
              ?.publicationStatus ||
            activeGateSnapshotCoverage?.selectedPublishedMembershipObservation
              ?.publicationStatus ||
            null,
        pendingAckCount: pendingAckNodeIds.length,
        missingPublishedCount: Array.isArray(
          publicationConvergenceGate?.missingPublishedNodeIds,
        ) ?
          publicationConvergenceGate.missingPublishedNodeIds.length :
          ZERO,
        recoveryProtocolState,
        priorityRecoveryReasonCodes,
        gateReasons: publicationConvergenceGateReasons,
        prioritySpreadSatisfied:
            priorityPartitionSummary?.satisfied === true ?
              true :
              priorityPartitionSummary?.satisfied === false ?
                false :
                null,
      } :
      null);
  const activeGateClosureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: closureProgressSnapshot,
    bestProgressSnapshot: activeGateBestProgress,
    publicationConvergence: publicationDetails,
    publicationConvergenceGate,
    readinessMode: activeGate?.mode || activeGateNoProgress?.mode || null,
  });
  const normalizedPriorityRecoveryPartitionWitnesses =
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
      priorityRecoveryObservation?.priorityRecoveryPartitionWitnesses,
    );
  const allowPriorityRecoveryProgressSummary =
    pendingAckNodeIds.length === ZERO &&
    blockedNodeIds.length === ZERO &&
    (
      controlPlane?.hasExplicitPriorityRecoveryObservation !== true ||
      (
        publicationPending !== true &&
        prioritySpreadPending !== true
      )
    );
  const priorityRecoveryProgressSummary =
    allowPriorityRecoveryProgressSummary ?
      buildPriorityRecoveryProgressSummary(priorityRecoveryObservation) :
      null;
  const priorityRecoveryProgressClassCount =
    priorityRecoveryObservation?.priorityRecoveryProgressClassCount ??
    new Set(normalizedPriorityRecoveryPartitionWitnesses.flatMap((witness) =>
      Array.isArray(witness?.progressClassIds) ? witness.progressClassIds : [],
    )).size;
  const failingInvariantIds = normalizeDistinctStringArray([
    ...(Array.isArray(controlPlane?.priorityRecoveryInvariants?.failingInvariantIds) ?
      controlPlane.priorityRecoveryInvariants.failingInvariantIds :
      []),
    ...(Array.isArray(controlPlane?.priorityRecoveryInvariants?.invariants) ?
      controlPlane.priorityRecoveryInvariants.invariants
        .filter((invariant) => invariant?.passed !== true)
        .map((invariant) => invariant?.id) :
      []),
  ]);
  const publicationConvergence = !publicationDetails &&
    !publicationConvergenceGate &&
    !activeGate &&
    !activeGateProgress &&
    !activeGateBestProgress &&
    !activeGateNoProgress &&
    priorityRecoveryProgressClassCount === ZERO &&
    failingInvariantIds.length === ZERO ?
    null :
    {
      blockingReasonCounts,
      publicationConvergenceGateReasons,
      priorityRecoveryReasonCodes,
      pendingAckCount: pendingAckNodeIds.length,
      blockedNodeCount: blockedNodeIds.length,
      publicationPending,
      prioritySpreadPending,
      ...(activeGate ? {activeGate} : {}),
      closureWitnessClass:
            activeGate?.closureWitnessClass ||
            activeGateProgress?.closureWitnessClass ||
            activeGateBestProgress?.closureWitnessClass ||
            activeGateNoProgress?.closureWitnessClass ||
            activeGateClosureWitness?.closureWitnessClass ||
            null,
      priorityRecoveryProgressClassCount,
      priorityRecoveryProgressSummary,
      priorityRecoveryInvariantFailingIds: failingInvariantIds,
    };
  if (!publicationConvergence || typeof publicationConvergence !== 'object') {
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
  const dominantPublicationConvergenceGateReasons =
    resolveDominantPublicationConvergenceGateReasons({
      publicationConvergenceGateReasons:
        publicationConvergence.publicationConvergenceGateReasons,
      priorityRecoveryReasonCodes:
        publicationConvergence.priorityRecoveryReasonCodes,
      prioritySpreadPending: publicationConvergence.prioritySpreadPending,
    });
  for (const reason of dominantPublicationConvergenceGateReasons) {
    addNormalizedReasonCount(reasonCounts, reason, 1);
  }
  for (const reason of normalizeDistinctStringArray(
    publicationConvergence.priorityRecoveryReasonCodes,
  )) {
    addNormalizedReasonCount(reasonCounts, reason, 1);
  }
  addNormalizedReasonCount(
    reasonCounts,
    'publication_pending_ack',
    publicationConvergence.pendingAckCount || ZERO,
  );
  addNormalizedReasonCount(
    reasonCounts,
    'publication_blocked_nodes',
    publicationConvergence.blockedNodeCount || ZERO,
  );
  if (publicationConvergence.publicationPending === true) {
    addNormalizedReasonCount(reasonCounts, 'publication_pending', 1);
  }
  if (publicationConvergence.prioritySpreadPending === true) {
    addNormalizedReasonCount(reasonCounts, 'priority_spread_pending', 1);
  }
  if (
    publicationConvergence.closureWitnessClass &&
    typeof publicationConvergence.closureWitnessClass === 'string'
  ) {
    const normalizedClosureWitness =
      publicationConvergence.closureWitnessClass.trim();
    const closureWitnessHasOpenPublicationEvidence =
      publicationConvergence.publicationPending === true ||
      publicationConvergence.prioritySpreadPending === true ||
      normalizeNonNegativeCount(publicationConvergence.pendingAckCount) >
        ZERO ||
      normalizeNonNegativeCount(
        publicationConvergence.priorityRecoveryProgressClassCount,
      ) > ZERO;
    const closureWitnessIsStalePrioritySpread =
      normalizedClosureWitness ===
        PRIORITY_RECOVERY_CLOSURE_WITNESS_PRIORITY_SPREAD_PENDING &&
      closureWitnessHasOpenPublicationEvidence !== true;
    if (
      normalizedClosureWitness.length > ZERO &&
      closureWitnessIsStalePrioritySpread !== true
    ) {
      addNormalizedReasonCount(
        reasonCounts,
        'closure_witness_' + normalizedClosureWitness,
        1,
      );
    }
  }
  if (publicationConvergence.priorityRecoveryProgressClassCount > ZERO) {
    addNormalizedReasonCount(
      reasonCounts,
      'priority_recovery_progress_class',
      publicationConvergence.priorityRecoveryProgressClassCount,
    );
  }
  addPriorityRecoveryProgressReasonCounts(
    reasonCounts,
    publicationConvergence.priorityRecoveryProgressSummary,
  );
  if (
    Array.isArray(publicationConvergence.priorityRecoveryInvariantFailingIds) &&
    publicationConvergence.priorityRecoveryInvariantFailingIds.length > ZERO
  ) {
    addNormalizedReasonCount(
      reasonCounts,
      'priority_recovery_invariant_failure',
      publicationConvergence.priorityRecoveryInvariantFailingIds.length,
    );
  }
  return reasonCounts;
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
    recoverability:
      typeof rawDelay.recoverability === 'string' ?
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
  if (
    normalized.cause &&
    normalized.cause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE
  ) {
    signals.push('activeGateReadinessCause=' + normalized.cause);
  }
  if (normalized.recoverability) {
    signals.push(
      'activeGateReadinessRecoverability=' + normalized.recoverability,
    );
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
    signals.push(
      'activeGateReadinessRecoverability=' + normalized.recoverability,
    );
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
    signals.push(
      'activeGateReadinessTerminalReason=' + normalized.terminalReason,
    );
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
    mode:
      typeof rawReadinessFailure.mode === 'string' &&
      rawReadinessFailure.mode.length > ZERO ?
        rawReadinessFailure.mode :
        null,
    classCode:
      typeof rawReadinessFailure.classCode === 'string' &&
      rawReadinessFailure.classCode.length > ZERO ?
        rawReadinessFailure.classCode :
        null,
    recoverability:
      typeof rawReadinessFailure.recoverability === 'string' &&
      rawReadinessFailure.recoverability.length > ZERO ?
        rawReadinessFailure.recoverability :
        null,
    progressSignal: isRecord(progressSignal) ?
      {
        attemptsSinceProgress: Number.isInteger(
          progressSignal.attemptsSinceProgress,
        ) ?
          Math.max(ZERO, progressSignal.attemptsSinceProgress) :
          null,
        maxAttempts:
            Number.isInteger(progressSignal.maxAttempts) &&
            progressSignal.maxAttempts > ZERO ?
              Math.max(ZERO, progressSignal.maxAttempts) :
              null,
        stalled: progressSignal.stalled === true,
      } :
      null,
    terminalReason:
      typeof rawReadinessFailure.terminalReason === 'string' &&
      rawReadinessFailure.terminalReason.length > ZERO ?
        rawReadinessFailure.terminalReason :
        null,
    source:
      typeof rawReadinessFailure.source === 'string' &&
      rawReadinessFailure.source.length > ZERO ?
        rawReadinessFailure.source :
        null,
    cause:
      typeof rawReadinessFailure.cause === 'string' &&
      rawReadinessFailure.cause.length > ZERO ?
        rawReadinessFailure.cause :
        null,
    error:
      typeof rawReadinessFailure.error === 'string' &&
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

function hasBlockingReadinessFailure(readinessFailure = null) {
  const normalized = normalizeReadinessFailure(readinessFailure);
  if (!normalized) {
    return false;
  }
  const readinessDelayCause =
    typeof normalized.cause === 'string' ? normalized.cause : null;
  return (
    normalized.classCode !== null ||
    normalized.terminalReason !== null ||
    (readinessDelayCause !== null &&
      readinessDelayCause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE) ||
    normalized.progressSignal?.stalled === true
  );
}

function resolveReadinessFailure(controlPlane = {}) {
  const activeGateNoProgress =
    controlPlane?.activeGateNoProgress &&
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
  if (!isRecord(activeGateNoProgress) && !readinessDelay) {
    return null;
  }
  const attemptsSinceProgress = Number.isInteger(
    activeGateNoProgress?.attemptsSinceProgress,
  ) ?
    Math.max(ZERO, activeGateNoProgress.attemptsSinceProgress) :
    null;
  const maxAttempts =
    Number.isInteger(activeGateNoProgress?.maxAttempts) &&
    activeGateNoProgress.maxAttempts > ZERO ?
      Math.max(ZERO, activeGateNoProgress.maxAttempts) :
      null;
  const stalled = activeGateNoProgress?.stalled === true;
  const reasonCode = activeGateNoProgress?.reasonCode;
  const classCode =
    readinessDelay &&
    readinessDelay.timedOut === true &&
    readinessDelay.cause !== ACTIVE_GATE_READINESS_DELAY_CAUSE_NONE ?
      readinessDelay.cause :
      stalled || reasonCode === NO_PROGRESS_REASON_CODE ?
        READINESS_FAILURE_CLASS_NO_PROGRESS :
        null;
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
      typeof reasonCode === 'string' && reasonCode.length > ZERO ?
        reasonCode :
        null,
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
          'Probe delay is recoverable in this path; allow bounded retry.',
        operatorRecommendation:
          'Re-run with reduced startup concurrency and watch snapshot probe latencies.',
      };
    }
    return {
      failureAction: 'Snapshot/reachability timeout is blocking convergence.',
      operatorRecommendation:
        'Inspect snapshot query latency, admin readiness, and host/network stability before rerun.',
    };
  }
  if (readinessFailure.classCode === READINESS_FAILURE_CLASS_NO_PROGRESS) {
    return {
      failureAction:
        'Convergence has stopped progressing within configured guarantees.',
      operatorRecommendation:
        'Inspect publication convergence blockers and topology readiness evidence before retry.',
    };
  }
  return {
    failureAction: 'Readiness convergence issue requires triage.',
    operatorRecommendation:
      'Collect active-gate diagnostics and follow triage priorities before rerun.',
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
    (typeof snapshot?.operationId === 'string' &&
      snapshot.operationId.length > ZERO)
  ) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
}

function normalizePriorityRecoveryDecisionSnapshotOperationIds(snapshot) {
  return normalizeDistinctStringArray([
    snapshot?.operationId,
    ...(Array.isArray(snapshot?.coordinator?.operationIds) ?
      snapshot.coordinator.operationIds :
      []),
    snapshot?.coordinator?.operation?.operationId,
  ]);
}

function hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) {
  return (
    normalizePriorityRecoveryDecisionSnapshotOperationIds(snapshot).length >
      ZERO ||
    Number(snapshot?.coordinator?.operationCount) > ZERO
  );
}

function isPriorityRecoverySyntheticNoOperationDecisionSnapshot(snapshot) {
  const semanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState) || null;
  const blockerReasons = normalizeDistinctStringArray(snapshot?.blockerReasons);
  const hasSyntheticNoOperationBlocker = blockerReasons.some((blockerReason) =>
    PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASONS.includes(
      blockerReason,
    ),
  );
  return (
    hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) !== true &&
    semanticState === PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION &&
    hasSyntheticNoOperationBlocker
  );
}

function hasPriorityRecoveryDecisionSnapshotProgress(snapshot) {
  if (hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) === true) {
    return true;
  }
  const semanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState) || null;
  const blockerReasons = normalizeDistinctStringArray(snapshot?.blockerReasons);
  const hasSyntheticNoOperationBlocker = blockerReasons.some((blockerReason) =>
    PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASONS.includes(
      blockerReason,
    ),
  );
  return (
    semanticState !== PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION ||
    !hasSyntheticNoOperationBlocker
  );
}

function resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot) {
  const operation = snapshot?.coordinator?.operation || {};
  const freshnessCandidates = [
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CAPTURED_AT],
    snapshot?.observation?.provenance?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CAPTURED_AT
    ],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.COMPLETED_AT_MS
    ],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.UPDATED_AT_MS
    ],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD
        .TARGET_SERVICE_PROGRESS_AT_MS
    ],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CREATED_AT_MS
    ],
  ].map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > ZERO);
  return freshnessCandidates.length > ZERO ?
    Math.max(...freshnessCandidates) :
    ZERO;
}

function shouldDropPriorityRecoverySyntheticNoOperationSnapshot({
  progressFreshnessMs,
  syntheticFreshnessMs,
}) {
  return (
    syntheticFreshnessMs === ZERO ||
    progressFreshnessMs === ZERO ||
    progressFreshnessMs >= syntheticFreshnessMs
  );
}

function filterPriorityRecoverySyntheticNoOperationConflicts(snapshots) {
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : [];
  const progressFreshnessByPartitionId = new Map();
  for (const snapshot of normalizedSnapshots) {
    if (hasPriorityRecoveryDecisionSnapshotProgress(snapshot) !== true) {
      continue;
    }
    const partitionId = String(snapshot?.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    progressFreshnessByPartitionId.set(
      partitionId,
      Math.max(
        progressFreshnessByPartitionId.get(partitionId) || ZERO,
        resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot),
      ),
    );
  }
  if (progressFreshnessByPartitionId.size === ZERO) {
    return normalizedSnapshots;
  }
  return normalizedSnapshots.filter((snapshot) => {
    const partitionId = String(snapshot?.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      return false;
    }
    const progressFreshnessMs = progressFreshnessByPartitionId.get(partitionId);
    if (
      progressFreshnessMs === undefined ||
      isPriorityRecoverySyntheticNoOperationDecisionSnapshot(snapshot) !== true
    ) {
      return true;
    }
    return !shouldDropPriorityRecoverySyntheticNoOperationSnapshot({
      progressFreshnessMs,
      syntheticFreshnessMs:
        resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot),
    });
  });
}

function buildPriorityRecoveryExplicitSemanticStateByPartitionId(
  partitionIdsBySemanticState,
) {
  const explicitSemanticStateByPartitionId = new Map();
  if (!isRecord(partitionIdsBySemanticState)) {
    return explicitSemanticStateByPartitionId;
  }
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    const normalizedSemanticState =
      normalizePriorityRecoverySemanticStateId(semanticState);
    if (!normalizedSemanticState) {
      continue;
    }
    for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
      if (!explicitSemanticStateByPartitionId.has(partitionId)) {
        explicitSemanticStateByPartitionId.set(
          partitionId,
          normalizedSemanticState,
        );
      }
    }
  }
  return explicitSemanticStateByPartitionId;
}


function resolvePriorityRecoveryExplicitSemanticState(
  snapshot,
  explicitSemanticStateByPartitionId,
) {
  const explicitSemanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticStateId) ||
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState);
  if (explicitSemanticState) {
    return explicitSemanticState;
  }
  const partitionId = String(snapshot?.partitionId || '').trim();
  if (
    partitionId.length === ZERO ||
    !(explicitSemanticStateByPartitionId instanceof Map)
  ) {
    return null;
  }
  return explicitSemanticStateByPartitionId.get(partitionId) || null;
}

function resolvePriorityRecoveryDecisionSnapshotProgressSortTimestamp(
  snapshot,
) {
  const operation = snapshot?.coordinator?.operation || {};
  const progressTimestampCandidates = [
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.COMPLETED_AT_MS
    ],
    operation[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.UPDATED_AT_MS],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD
        .TARGET_SERVICE_PROGRESS_AT_MS
    ],
    snapshot?.progress?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.LAST_PROGRESS_AT_MS
    ],
    operation[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CREATED_AT_MS],
  ]
    .map((candidate) => Number(candidate))
    .filter((candidate) => Number.isFinite(candidate) && candidate > ZERO);
  return progressTimestampCandidates.length > ZERO ?
    Math.max(...progressTimestampCandidates) :
    ZERO;
}

function resolvePriorityRecoveryDecisionSnapshotSortTimestamp(snapshot) {
  const progressTimestamp =
    resolvePriorityRecoveryDecisionSnapshotProgressSortTimestamp(snapshot);
  if (progressTimestamp > ZERO) {
    return progressTimestamp;
  }
  const updatedAtMs = Number(
    snapshot?.observation?.provenance?.capturedAt ??
      ZERO,
  );
  return Number.isFinite(updatedAtMs) ? updatedAtMs : ZERO;
}

function comparePriorityRecoveryDecisionSummarySnapshots(left, right) {
  const leftEpoch = Number.isFinite(left?.epoch) ? left.epoch : -1;
  const rightEpoch = Number.isFinite(right?.epoch) ? right.epoch : -1;
  if (leftEpoch !== rightEpoch) {
    return leftEpoch - rightEpoch;
  }
  const leftTimestamp = resolvePriorityRecoveryDecisionSnapshotSortTimestamp(
    left,
  );
  const rightTimestamp = resolvePriorityRecoveryDecisionSnapshotSortTimestamp(
    right,
  );
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  return String(left?.correlationKey || '').localeCompare(
    String(right?.correlationKey || ''),
  );
}

function selectPriorityRecoveryDecisionSummarySnapshots(snapshots) {
  const latestSnapshotByPartitionId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    if (!isRecord(snapshot)) {
      continue;
    }
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    const currentSnapshot = latestSnapshotByPartitionId.get(partitionId);
    if (
      !currentSnapshot ||
      comparePriorityRecoveryDecisionSummarySnapshots(
        currentSnapshot,
        snapshot,
      ) < ZERO
    ) {
      latestSnapshotByPartitionId.set(partitionId, snapshot);
    }
  }
  return [...latestSnapshotByPartitionId.values()].sort((left, right) =>
    String(left?.partitionId || '').localeCompare(
      String(right?.partitionId || ''),
    ),
  );
}

function initializePriorityRecoveryDecisionSummarySetMap(orderedIds) {
  return orderedIds.reduce((summarySetMap, orderedId) => {
    summarySetMap[orderedId] = new Set();
    return summarySetMap;
  }, {});
}

function normalizePriorityRecoveryDecisionSummarySetMap(summarySetMap) {
  return Object.fromEntries(
    Object.entries(summarySetMap).map(([summaryId, partitionIds]) => [
      summaryId,
      [...partitionIds].sort(),
    ]),
  );
}

function collectPriorityRecoveryDecisionSummarySets({
  snapshots = [],
  blockerPartitionIdsByReason: rawBlockerPartitionIdsByReason = null,
  partitionIdsBySemanticState: rawPartitionIdsBySemanticState = null,
  hasExplicitSemanticStateContract = false,
} = {}) {
  const blockerPartitionIdsByReason =
    initializePriorityRecoveryDecisionSummarySetMap(
      PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
    );
  const partitionIdsBySemanticState =
    initializePriorityRecoveryDecisionSummarySetMap(
      PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
    );
  const summarySnapshots =
    selectPriorityRecoveryDecisionSummarySnapshots(snapshots);
  const summaryPartitionIds = new Set(
    summarySnapshots.map((snapshot) => snapshot.partitionId),
  );
  const explicitSemanticStateByPartitionId =
    buildPriorityRecoveryExplicitSemanticStateByPartitionId(
      rawPartitionIdsBySemanticState,
    );
  const allowLegacySemanticStateInference =
    hasExplicitSemanticStateContract !== true;

  for (const snapshot of summarySnapshots) {
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    const blockerReasons = normalizeDistinctStringArray(snapshot.blockerReasons);
    for (const blockerReason of blockerReasons) {
      if (!(blockerPartitionIdsByReason[blockerReason] instanceof Set)) {
        blockerPartitionIdsByReason[blockerReason] = new Set();
      }
      blockerPartitionIdsByReason[blockerReason].add(partitionId);
    }
    const semanticState =
      resolvePriorityRecoveryExplicitSemanticState(
        snapshot,
        explicitSemanticStateByPartitionId,
      ) ||
      (allowLegacySemanticStateInference === true ?
        inferPriorityRecoverySemanticState(snapshot, blockerReasons) :
        null);
    if (partitionIdsBySemanticState[semanticState] instanceof Set) {
      partitionIdsBySemanticState[semanticState].add(partitionId);
    }
  }

  if (isRecord(rawBlockerPartitionIdsByReason)) {
    for (const [blockerReason, partitionIds] of Object.entries(
      rawBlockerPartitionIdsByReason,
    )) {
      if (!(blockerPartitionIdsByReason[blockerReason] instanceof Set)) {
        blockerPartitionIdsByReason[blockerReason] = new Set();
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        if (summaryPartitionIds.has(partitionId)) {
          continue;
        }
        blockerPartitionIdsByReason[blockerReason].add(partitionId);
        summaryPartitionIds.add(partitionId);
      }
    }
  }

  if (isRecord(rawPartitionIdsBySemanticState)) {
    for (const [semanticState, partitionIds] of Object.entries(
      rawPartitionIdsBySemanticState,
    )) {
      const normalizedSemanticState =
        normalizePriorityRecoverySemanticStateId(semanticState);
      if (!normalizedSemanticState) {
        continue;
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        if (summaryPartitionIds.has(partitionId)) {
          continue;
        }
        partitionIdsBySemanticState[normalizedSemanticState].add(partitionId);
        summaryPartitionIds.add(partitionId);
      }
    }
  }

  return {
    blockerPartitionIdsByReason,
    partitionIdsBySemanticState,
    partitionIds: summaryPartitionIds,
  };
}

function normalizePriorityRecoveryDecisionSnapshots(value) {
  if (!isRecord(value)) {
    return null;
  }
  const snapshots = [];
  const partitionIdSet = new Set();
  const hasExplicitSemanticStateContract = isRecord(
    value.partitionIdsBySemanticState,
  );

  for (const snapshot of Array.isArray(value.snapshots) ?
    value.snapshots :
    []) {
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
    const blockerReasons = normalizeDistinctStringArray(
      snapshot.blockerReasons,
    );
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
      planner: isRecord(snapshot.planner) ?
        cloneJsonValue(snapshot.planner) :
        null,
      spreadCompletion: isRecord(snapshot.spreadCompletion) ?
        cloneJsonValue(snapshot.spreadCompletion) :
        null,
      completion: isRecord(snapshot.completion) ?
        cloneJsonValue(snapshot.completion) :
        null,
      observation: isRecord(snapshot.observation) ?
        cloneJsonValue(snapshot.observation) :
        null,
      conditions: isRecord(snapshot.conditions) ?
        cloneJsonValue(snapshot.conditions) :
        null,
      actuation: isRecord(snapshot.actuation) ?
        cloneJsonValue(snapshot.actuation) :
        null,
      progress: isRecord(snapshot.progress) ?
        cloneJsonValue(snapshot.progress) :
        null,
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
      semanticState:
        normalizePriorityRecoverySemanticStateId(snapshot.semanticState) ||
        normalizePriorityRecoverySemanticStateId(snapshot.semanticStateId) ||
        inferPriorityRecoverySemanticState(snapshot, blockerReasons),
    });
  }

  const summarySets = collectPriorityRecoveryDecisionSummarySets({
    snapshots,
    blockerPartitionIdsByReason: value.blockerPartitionIdsByReason,
    partitionIdsBySemanticState: value.partitionIdsBySemanticState,
    hasExplicitSemanticStateContract,
  });
  for (const partitionId of summarySets.partitionIds) {
    partitionIdSet.add(partitionId);
  }
  const normalizedBlockerPartitionIdsByReason =
    normalizePriorityRecoveryDecisionSummarySetMap(
      summarySets.blockerPartitionIdsByReason,
    );
  const normalizedPartitionIdsBySemanticState =
    normalizePriorityRecoveryDecisionSummarySetMap(
      summarySets.partitionIdsBySemanticState,
    );
  const publicationEpoch = Number.isFinite(value.publicationEpoch) ?
    Math.floor(value.publicationEpoch) :
    null;
  const priorityPartitionSummary = isRecord(
    value.priorityPartitionSummary ?? value.priority_partition_summary,
  ) ?
    cloneJsonValue(
      value.priorityPartitionSummary ?? value.priority_partition_summary,
    ) :
    null;
  const normalizedDecisionSnapshots = {
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
    priorityPartitionSummary,
    hasExplicitSemanticStateContract,
  };
  return {
    ...normalizedDecisionSnapshots,
    closureWitness:
      isRecord(value.closureWitness) ?
        cloneJsonValue(value.closureWitness) :
        buildPriorityRecoveryClosureWitness({
          decisionSnapshots: normalizedDecisionSnapshots,
          priorityPartitionSummary,
        }),
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
      const currentSnapshot = snapshotsByCorrelationKey.get(correlationKey);
      if (
        !currentSnapshot ||
        comparePriorityRecoveryDecisionSummarySnapshots(
          currentSnapshot,
          snapshot,
        ) < ZERO
      ) {
        snapshotsByCorrelationKey.set(correlationKey, snapshot);
      }
    }
  }

  const hasExplicitSemanticStateContract =
    normalizedFallback.hasExplicitSemanticStateContract === true ||
    normalizedPrimary.hasExplicitSemanticStateContract === true;
  const mergedSnapshots = filterPriorityRecoverySyntheticNoOperationConflicts(
    [...snapshotsByCorrelationKey.values()],
  ).sort((left, right) => {
    const partitionDelta = String(left.partitionId || '').localeCompare(
      String(right.partitionId || ''),
    );
    if (partitionDelta !== ZERO) {
      return partitionDelta;
    }
    const leftEpoch = Number.isFinite(left.epoch) ? left.epoch : -1;
    const rightEpoch = Number.isFinite(right.epoch) ? right.epoch : -1;
    if (leftEpoch !== rightEpoch) {
      return leftEpoch - rightEpoch;
    }
    return String(left.correlationKey || '').localeCompare(
      String(right.correlationKey || ''),
    );
  });
  const mergedPartitionIdSet = new Set(
    mergedSnapshots.map((snapshot) => snapshot.partitionId),
  );
  const mergedBlockerPartitionIdsByReason = {};
  const mergedPartitionIdsBySemanticState = {};
  for (const progressClassId of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    mergedBlockerPartitionIdsByReason[progressClassId] =
      normalizeDistinctStringArray([
        ...(normalizedFallback.blockerPartitionIdsByReason?.[progressClassId] ||
          []),
        ...(normalizedPrimary.blockerPartitionIdsByReason?.[progressClassId] ||
          []),
      ]);
  }
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    mergedPartitionIdsBySemanticState[semanticState] =
      normalizeDistinctStringArray([
        ...(normalizedFallback.partitionIdsBySemanticState?.[semanticState] ||
          []),
        ...(normalizedPrimary.partitionIdsBySemanticState?.[semanticState] ||
          []),
      ]);
  }
  const mergedSummarySets = collectPriorityRecoveryDecisionSummarySets({
    snapshots: mergedSnapshots,
    blockerPartitionIdsByReason: mergedBlockerPartitionIdsByReason,
    partitionIdsBySemanticState: mergedPartitionIdsBySemanticState,
    hasExplicitSemanticStateContract,
  });
  for (const partitionId of mergedSummarySets.partitionIds) {
    mergedPartitionIdSet.add(partitionId);
  }
  const normalizedBlockerPartitionIdsByReason =
    normalizePriorityRecoveryDecisionSummarySetMap(
      mergedSummarySets.blockerPartitionIdsByReason,
    );
  const normalizedPartitionIdsBySemanticState =
    normalizePriorityRecoveryDecisionSummarySetMap(
      mergedSummarySets.partitionIdsBySemanticState,
    );
  const priorityPartitionSummary =
    normalizedPrimary.priorityPartitionSummary ||
    normalizedFallback.priorityPartitionSummary ||
    null;
  const mergedDecisionSnapshots = {
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
    priorityPartitionSummary,
    hasExplicitSemanticStateContract,
  };
  return {
    ...mergedDecisionSnapshots,
    closureWitness:
      buildPriorityRecoveryClosureWitness({
        decisionSnapshots: mergedDecisionSnapshots,
        priorityPartitionSummary,
      }) ||
      normalizedPrimary.closureWitness ||
      normalizedFallback.closureWitness ||
      null,
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
  PLAYBACK_STAGE_LOAD_READINESS_WAITING,
  PLAYBACK_STAGE_LOAD_READINESS_STABLE,
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
  PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
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
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACK_NODES,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
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
};
