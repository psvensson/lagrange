import {CLUSTER_STARTUP_GATE_LAYER} from './cluster-startup-gate-layer.js';
import {
  LIFECYCLE_REASON,
} from '../../../src/bootstrap/lifecycle-controller-constants.js';
import {
  ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
} from './active-gate-closure-classification.js';

const {
  ACTIVE_WAIT_NO_PROGRESS_CLASS_CODE,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
  ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  ONE,
  ZERO,
  normalizeDistinctStringArray,
} = CLUSTER_STARTUP_GATE_LAYER;

const LOAD_READINESS_STABLE_WINDOW_TIMESTAMP_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});
const LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP = Object.freeze({
  state: LOAD_READINESS_STABLE_WINDOW_TIMESTAMP_STATE.UNAVAILABLE,
  timestampMs: ZERO,
});
const LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE = 'none';
const LOAD_READINESS_STABLE_WINDOW_SOURCE_SELECTED_SNAPSHOT =
  'selected_snapshot';
const LOAD_READINESS_STABLE_WINDOW_SOURCE_OBSERVED_PROBE =
  'observed_probe';
const LOAD_READINESS_STABLE_WINDOW_STATE_CLOSED = 'closed';
const LOAD_READINESS_STABLE_WINDOW_STATE_PENDING = 'pending';
const LOAD_READINESS_STABLE_WINDOW_STATE_BLOCKED = 'blocked';
const LOAD_READINESS_STABLE_WINDOW_BLOCKER_NOT_ACTIVE =
  'load_readiness_not_active';
const LOAD_READINESS_STABLE_WINDOW_ROOT_CAUSE_CLASS = 'startup';
const LOAD_READINESS_STABLE_WINDOW_REASON_READY = 'ready';
const LOAD_READINESS_STABLE_WINDOW_REASON_PENDING =
  LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
const LOAD_READINESS_PHASE_UNSPECIFIED = 'unspecified';
const LOAD_READINESS_STABLE_WINDOW_DECISION_TABLE = Object.freeze([
  Object.freeze({
    state: LOAD_READINESS_STABLE_WINDOW_STATE_CLOSED,
    reasonCode: LOAD_READINESS_STABLE_WINDOW_REASON_READY,
    matches: (evidence) =>
      evidence.allActive === true &&
      evidence.stableElapsedMs >= evidence.stableWindowMs,
  }),
  Object.freeze({
    state: LOAD_READINESS_STABLE_WINDOW_STATE_PENDING,
    reasonCode: LOAD_READINESS_STABLE_WINDOW_REASON_PENDING,
    matches: (evidence) => evidence.allActive === true,
  }),
  Object.freeze({
    state: LOAD_READINESS_STABLE_WINDOW_STATE_BLOCKED,
    reasonCode: LOAD_READINESS_STABLE_WINDOW_BLOCKER_NOT_ACTIVE,
    matches: () => true,
  }),
]);
const ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_CURRENT = 'current';
const ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_LAST_MEANINGFUL =
  'last_meaningful';
const ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_BEST_SNAPSHOT_COVERAGE =
  'best_snapshot_coverage';
const ACTIVE_WAIT_TYPE_OBJECT = 'object';
const ACTIVE_WAIT_READINESS_DELAY_STATE = Object.freeze({
  ABSENT: 'absent',
  PRESENT: 'present',
  TIMED_OUT: 'timed_out',
});
const ACTIVE_WAIT_READINESS_DELAY_SOURCE = Object.freeze({
  NONE: 'none',
  NO_PROGRESS: 'no_progress',
  PROGRESS: 'progress',
});
const ACTIVE_WAIT_READINESS_DELAY_OUTCOME_NONE = Object.freeze({
  source: ACTIVE_WAIT_READINESS_DELAY_SOURCE.NONE,
});
const ACTIVE_WAIT_READINESS_DELAY_OUTCOME_NO_PROGRESS = Object.freeze({
  source: ACTIVE_WAIT_READINESS_DELAY_SOURCE.NO_PROGRESS,
});
const ACTIVE_WAIT_READINESS_DELAY_OUTCOME_PROGRESS = Object.freeze({
  source: ACTIVE_WAIT_READINESS_DELAY_SOURCE.PROGRESS,
});
const ACTIVE_WAIT_READINESS_FAILURE_CLASS_STARTUP_SUPPORT_PENDING =
  'startup_support_pending';
const ACTIVE_WAIT_READINESS_FAILURE_SOURCE_ACTIVE_GATE_PROGRESS =
  'activeGateProgress';
const ACTIVE_WAIT_READINESS_FAILURE_CAUSE_INACTIVE_NODES = 'inactive_nodes';
const ACTIVE_WAIT_READINESS_FAILURE_CAUSE_PRIORITY_RECOVERY_PROGRESS =
  'priority_recovery_progress';
const ACTIVE_WAIT_READINESS_FAILURE_CAUSE_PUBLICATION_GATE =
  'publication_gate';
const ACTIVE_WAIT_READINESS_FAILURE_CAUSE_OWNER_RECOVERY =
  'active_gate_owner_recovery_pending';
const ACTIVE_WAIT_READINESS_FAILURE_CAUSE_SNAPSHOT_TIMEOUT =
  'snapshot_timeout';
const ACTIVE_WAIT_READINESS_FAILURE_SOURCE_SELECTED_SNAPSHOT_ERROR =
  'selectedSnapshotError';
const ACTIVE_WAIT_BLOCKER_INACTIVE_NODES_PREFIX = 'inactive_nodes=';
const ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_TABLE = Object.freeze([
  Object.freeze({
    decision: ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_BEST_SNAPSHOT_COVERAGE,
    matches: (evidence) =>
      evidence.currentSnapshotZeroCoverageRegression === true &&
      evidence.bestSnapshotCoverageProgressPresent === true &&
      evidence.bestSnapshotCoverageNodeCount >
        evidence.currentSnapshotCoverageNodeCount &&
      evidence.bestSnapshotCoverageRegressionWithoutPublicationImprovement ===
        true,
  }),
  Object.freeze({
    decision: ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_LAST_MEANINGFUL,
    matches: (evidence) =>
      evidence.currentSnapshotZeroCoverageRegression === true &&
      evidence.lastMeaningfulCoverageNodeCount >
        evidence.currentSnapshotCoverageNodeCount,
  }),
  Object.freeze({
    decision: ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_LAST_MEANINGFUL,
    matches: (evidence) =>
      evidence.currentPriorityRecoveryOperationEvidenceRegression === true &&
      evidence.activeRegressionWithoutPublicationImprovement === true,
  }),
  Object.freeze({
    decision: ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_LAST_MEANINGFUL,
    matches: (evidence) =>
      evidence.coverageRegressionWithoutPublicationImprovement === true,
  }),
  Object.freeze({
    decision: ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_CURRENT,
    matches: () => true,
  }),
]);
const ACTIVE_WAIT_READINESS_DELAY_DECISION_TABLE = Object.freeze([
  Object.freeze({
    outcome: ACTIVE_WAIT_READINESS_DELAY_OUTCOME_NO_PROGRESS,
    matches: (evidence) =>
      evidence.noProgressDelayState === ACTIVE_WAIT_READINESS_DELAY_STATE.TIMED_OUT,
  }),
  Object.freeze({
    outcome: ACTIVE_WAIT_READINESS_DELAY_OUTCOME_PROGRESS,
    matches: (evidence) =>
      evidence.progressDelayState === ACTIVE_WAIT_READINESS_DELAY_STATE.TIMED_OUT,
  }),
  Object.freeze({
    outcome: ACTIVE_WAIT_READINESS_DELAY_OUTCOME_NO_PROGRESS,
    matches: (evidence) =>
      evidence.noProgressDelayState === ACTIVE_WAIT_READINESS_DELAY_STATE.PRESENT,
  }),
  Object.freeze({
    outcome: ACTIVE_WAIT_READINESS_DELAY_OUTCOME_PROGRESS,
    matches: (evidence) =>
      evidence.progressDelayState === ACTIVE_WAIT_READINESS_DELAY_STATE.PRESENT,
  }),
  Object.freeze({
    outcome: ACTIVE_WAIT_READINESS_DELAY_OUTCOME_NONE,
    matches: () => true,
  }),
]);
const ACTIVE_WAIT_TERMINAL_PRIORITY_RECOVERY_EVIDENCE = Object.freeze({
  OPERATION_STALLED: Object.freeze({
    progressClass:
      ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.OPERATION_NO_TRANSITIONS,
    semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
  }),
  RECOVERING_IN_FLIGHT: Object.freeze({
    progressClass: null,
    semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
  }),
  NEEDS_OPERATION: Object.freeze({
    progressClass:
      ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.ELIGIBLE_NO_OPERATION,
    semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
  }),
});
const STARTUP_OWNER_PROGRESS_CONTINUATION_STATE = Object.freeze({
  BLOCKED: 'blocked',
  CONTINUE: 'continue',
});
const STARTUP_OWNER_PROGRESS_CONTINUATION_REASON = Object.freeze({
  OWNER_PROGRESS_CONTEXT_ABSENT: 'owner_progress_context_absent',
  PROGRESS_NOT_FRESH: 'progress_not_fresh',
  RECOVERING_IN_FLIGHT_ABSENT: 'recovering_in_flight_absent',
  OWNER_WITNESS_ABSENT: 'owner_witness_absent',
  OWNER_STEP_DEADLINE: 'owner_step_deadline',
});
const STARTUP_OWNER_PROGRESS_PUBLICATION_PUBLISHED = 'PUBLISHED';
const STARTUP_OWNER_PROGRESS_OPERATION_OWNER = 'operation_workflow_owner';
const STARTUP_OWNER_PROGRESS_BOUNDARY_WORKFLOW = 'workflow_progress';
const STARTUP_OWNER_PROGRESS_WAIT_EVENT_DRIVEN = 'event_driven';
const STARTUP_OWNER_PROGRESS_ACTION_ADVANCE = 'advance_existing_operation';
const STARTUP_OWNER_PROGRESS_ACTION_WAIT = 'wait_for_operation_progress';
const STARTUP_OWNER_PROGRESS_SEMANTIC_RECOVERING =
  PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
const STARTUP_OWNER_PROGRESS_NO_EXTENSION_MS = ZERO;
const STARTUP_SNAPSHOT_REPAIR_CONTINUATION_STATE = Object.freeze({
  BLOCKED: 'blocked',
  CONTINUE: 'continue',
});
const STARTUP_SNAPSHOT_REPAIR_CONTINUATION_REASON = Object.freeze({
  SNAPSHOT_RETRY_ABSENT: 'snapshot_retry_absent',
  OWNER_HANDOFF_ABSENT: 'owner_handoff_absent',
  HANDOFF_OUTCOME_ABSENT: 'handoff_outcome_absent',
  OWNER_QUEUE_UNBOUNDED: 'owner_queue_unbounded',
  SNAPSHOT_REPAIR_RETRY: 'snapshot_repair_retry',
});
const STARTUP_SNAPSHOT_REPAIR_MODE_REPAIR_DEFERRED = 'repair_deferred';
const STARTUP_SNAPSHOT_REPAIR_CONTRACT_DEFERRED = 'deferred';
const STARTUP_SNAPSHOT_REPAIR_NEXT_ACTION_RETRY = 'retry';
const STARTUP_SNAPSHOT_REPAIR_HANDOFF_REASON_OWNER_RECONCILE =
  'owner_reconcile_pending';
const STARTUP_SNAPSHOT_REPAIR_HANDOFF_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const STARTUP_SNAPSHOT_REPAIR_HANDOFF_OUTCOME_WRITE_DEFERRED =
  'write_deferred';
const STARTUP_SNAPSHOT_REPAIR_NO_EXTENSION_MS = ZERO;
const ACTIVE_GATE_SNAPSHOT_REPAIR_STARTUP_READINESS_MODES = Object.freeze([
  CLUSTER_READINESS_MODE_STARTUP,
]);
const ACTIVE_GATE_SNAPSHOT_REPAIR_LOAD_READINESS_MODES = Object.freeze([
  CLUSTER_READINESS_MODE_LOAD,
]);
const ACTIVE_GATE_SNAPSHOT_REPAIR_MODE_UNSUPPORTED =
  'readiness_mode_unsupported';
const ACTIVE_WAIT_TERMINAL_PRIORITY_RECOVERY_REGRESSION_TABLE = Object.freeze([
  Object.freeze({
    decision: ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_LAST_MEANINGFUL,
    matches: (evidence) =>
      evidence.sharedRegressedPartitionCount > ZERO,
  }),
  Object.freeze({
    decision: ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_CURRENT,
    matches: () => true,
  }),
]);

function normalizeStableWindowTimestamp(timestampMs) {
  if (!Number.isFinite(timestampMs)) {
    return LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP;
  }
  return Object.freeze({
    state: LOAD_READINESS_STABLE_WINDOW_TIMESTAMP_STATE.AVAILABLE,
    timestampMs: Math.max(ZERO, Math.floor(timestampMs)),
  });
}

function isStableWindowTimestampAvailable(timestamp) {
  return (
    timestamp &&
    timestamp.state === LOAD_READINESS_STABLE_WINDOW_TIMESTAMP_STATE.AVAILABLE
  );
}

function resolveLoadReadinessSnapshotStartedAt({
  snapshotCoverage = {},
  resetAt = LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
  nowMs = ZERO,
} = {}) {
  const selectedCapturedAt = normalizeStableWindowTimestamp(
    snapshotCoverage?.selectedCapturedAtMs,
  );
  const normalizedResetAt = isStableWindowTimestampAvailable(resetAt) ?
    resetAt :
    LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP;
  if (
    snapshotCoverage?.completeCoverage !== true ||
    isStableWindowTimestampAvailable(selectedCapturedAt) !== true ||
    selectedCapturedAt.timestampMs > nowMs ||
    (
      isStableWindowTimestampAvailable(normalizedResetAt) &&
      selectedCapturedAt.timestampMs < normalizedResetAt.timestampMs
    )
  ) {
    return LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP;
  }
  return selectedCapturedAt;
}

function resolveLoadReadinessStableWindowStart({
  activeProbe,
  currentStartedAt = LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
  currentSource = LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE,
  resetAt = LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
  nowMs = ZERO,
} = {}) {
  if (activeProbe?.allActive !== true) {
    return {
      startedAt: LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
      source: LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE,
    };
  }
  const observedStartedAt = isStableWindowTimestampAvailable(currentStartedAt) ?
    currentStartedAt :
    normalizeStableWindowTimestamp(nowMs);
  const snapshotStartedAt = resolveLoadReadinessSnapshotStartedAt({
    snapshotCoverage: activeProbe?.snapshotCoverage || {},
    resetAt,
    nowMs,
  });
  const mayBackdateToSnapshot =
    currentSource !== LOAD_READINESS_STABLE_WINDOW_SOURCE_OBSERVED_PROBE;
  // The snapshot timestamp may only BACKDATE the window start (credit for
  // green observed before this wait's first probe). Adopting a NEWER capture
  // restarts the clock on every poll once forced repair re-captures the
  // snapshot per attempt, capping stableElapsedMs at one probe round-trip —
  // the window can then never close against a continuously green cluster
  // (CL-027).
  if (
    isStableWindowTimestampAvailable(snapshotStartedAt) &&
    snapshotStartedAt.timestampMs < observedStartedAt.timestampMs &&
    mayBackdateToSnapshot
  ) {
    return {
      startedAt: snapshotStartedAt,
      source: LOAD_READINESS_STABLE_WINDOW_SOURCE_SELECTED_SNAPSHOT,
    };
  }
  return {
    startedAt: observedStartedAt,
    source:
      isStableWindowTimestampAvailable(currentStartedAt) !== true ||
        currentSource === LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE ?
        LOAD_READINESS_STABLE_WINDOW_SOURCE_OBSERVED_PROBE :
        currentSource,
  };
}

function decideLoadReadinessStableWindow({
  activeProbe,
  stableWindowMs = ZERO,
  currentStartedAt = LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
  currentSource = LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE,
  resetAt = LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
  nowMs = ZERO,
} = {}) {
  const start = resolveLoadReadinessStableWindowStart({
    activeProbe,
    currentStartedAt,
    currentSource,
    resetAt,
    nowMs,
  });
  const stableElapsedMs =
    isStableWindowTimestampAvailable(start.startedAt) ?
      Math.max(ZERO, nowMs - start.startedAt.timestampMs) :
      ZERO;
  const evidence = {
    allActive: activeProbe?.allActive === true,
    stableWindowMs,
    stableElapsedMs,
  };
  const decision =
    LOAD_READINESS_STABLE_WINDOW_DECISION_TABLE.find((entry) =>
      entry.matches(evidence),
    );
  return {
    state: decision.state,
    reasonCode: decision.reasonCode,
    stable: decision.state === LOAD_READINESS_STABLE_WINDOW_STATE_CLOSED,
    stableWindowMs,
    stableElapsedMs,
    startedAt: start.startedAt,
    startedAtState: start.startedAt.state,
    startedAtMs: start.startedAt.timestampMs,
    observedAtMs: nowMs,
    resetAtState: resetAt.state,
    resetAtMs: resetAt.timestampMs,
    source: start.source,
  };
}

function buildLoadReadinessStableWindowFailure(stableWindow) {
  if (
    stableWindow?.reasonCode !== LOAD_READINESS_STABLE_WINDOW_REASON_PENDING
  ) {
    return null;
  }
  return {
    rootCauseClass: LOAD_READINESS_STABLE_WINDOW_ROOT_CAUSE_CLASS,
    dominantReason: LOAD_READINESS_STABLE_WINDOW_REASON_PENDING,
    reasonCounts: {
      [LOAD_READINESS_STABLE_WINDOW_REASON_PENDING]: ONE,
    },
  };
}

function normalizeLoadReadinessPhase(value) {
  return typeof value === 'string' && value.length > ZERO ?
    value :
    LOAD_READINESS_PHASE_UNSPECIFIED;
}

function hasActiveWaitBlockerWithPrefix(progressSnapshot, prefix) {
  return Array.isArray(progressSnapshot?.blockers) &&
    progressSnapshot.blockers.some((blocker) =>
      typeof blocker === 'string' && blocker.startsWith(prefix),
    );
}

function normalizeActiveWaitPositiveCount(value) {
  return Number.isInteger(value) && value > ZERO ? value : ZERO;
}

function isSelectedSnapshotReadinessTimeout(readinessDelay) {
  return readinessDelay?.timedOut === true &&
    readinessDelay.cause ===
      ACTIVE_WAIT_READINESS_FAILURE_CAUSE_SNAPSHOT_TIMEOUT &&
    readinessDelay.source ===
      ACTIVE_WAIT_READINESS_FAILURE_SOURCE_SELECTED_SNAPSHOT_ERROR;
}

function selectActiveWaitStartupSupportResidualCause(progressSnapshot) {
  if (
    !isActiveWaitProgressSnapshot(progressSnapshot) ||
    progressSnapshot.snapshotCoverageComplete !== true
  ) {
    return null;
  }
  if (
    normalizeActiveWaitPositiveCount(progressSnapshot.inactiveNodeCount) >
      ZERO ||
    hasActiveWaitBlockerWithPrefix(
      progressSnapshot,
      ACTIVE_WAIT_BLOCKER_INACTIVE_NODES_PREFIX,
    )
  ) {
    return ACTIVE_WAIT_READINESS_FAILURE_CAUSE_INACTIVE_NODES;
  }
  if (
    normalizeActiveWaitPositiveCount(
      progressSnapshot.activeGateOwnerCohortPendingRecoveryCount,
    ) > ZERO ||
    normalizeActiveWaitPositiveCount(
      progressSnapshot.activeGateOwnerCohortPendingReconcileCount,
    ) > ZERO
  ) {
    return ACTIVE_WAIT_READINESS_FAILURE_CAUSE_OWNER_RECOVERY;
  }
  if (
    normalizeActiveWaitPositiveCount(
      progressSnapshot.priorityRecoveryUnresolvedClassCount,
    ) > ZERO ||
    normalizeActiveWaitPositiveCount(
      progressSnapshot.priorityRecoveryUnresolvedSemanticStateCount,
    ) > ZERO
  ) {
    return ACTIVE_WAIT_READINESS_FAILURE_CAUSE_PRIORITY_RECOVERY_PROGRESS;
  }
  if (
    normalizeActiveWaitPositiveCount(progressSnapshot.gateReasonCount) >
      ZERO ||
    (Array.isArray(progressSnapshot.gateReasons) &&
      progressSnapshot.gateReasons.length > ZERO)
  ) {
    return ACTIVE_WAIT_READINESS_FAILURE_CAUSE_PUBLICATION_GATE;
  }
  return null;
}

function selectActiveWaitReadinessFailureProjection({
  mode = null,
  noProgress = null,
  readinessDelay = null,
} = {}) {
  if (
    mode !== CLUSTER_READINESS_MODE_LOAD ||
    isSelectedSnapshotReadinessTimeout(readinessDelay) !== true
  ) {
    return null;
  }
  const residualCause = selectActiveWaitStartupSupportResidualCause(
    noProgress?.currentProgress,
  );
  if (!residualCause) {
    return null;
  }
  return {
    classCode: ACTIVE_WAIT_READINESS_FAILURE_CLASS_STARTUP_SUPPORT_PENDING,
    source: ACTIVE_WAIT_READINESS_FAILURE_SOURCE_ACTIVE_GATE_PROGRESS,
    cause: residualCause,
    error: null,
  };
}

function buildActiveWaitReadinessFailure({
  mode = null,
  noProgress = null,
  attemptsSinceProgress = null,
  maxAttempts = null,
} = {}) {
  if (!noProgress || typeof noProgress !== 'object') {
    return null;
  }
  const readinessDelay =
    typeof noProgress.readinessDelay === 'object' &&
    noProgress.readinessDelay !== null ?
      noProgress.readinessDelay :
      null;
  const timedOut = readinessDelay && readinessDelay.timedOut === true;
  const projectedFailure = selectActiveWaitReadinessFailureProjection({
    mode,
    noProgress,
    readinessDelay,
  });
  let classCode = null;
  if (typeof projectedFailure?.classCode === 'string') {
    classCode = projectedFailure.classCode;
  } else if (
    timedOut &&
    typeof readinessDelay?.cause === 'string' &&
    readinessDelay.cause.length > ZERO
  ) {
    classCode = readinessDelay.cause;
  } else if (
    noProgress?.reasonCode === ACTIVE_WAIT_NO_PROGRESS_REASON_CODE ||
    noProgress?.stalled === true
  ) {
    classCode = ACTIVE_WAIT_NO_PROGRESS_CLASS_CODE;
  }
  return {
    mode: typeof mode === 'string' && mode.length > ZERO ? mode : null,
    classCode,
    recoverability:
      typeof readinessDelay?.recoverability === 'string' &&
      readinessDelay.recoverability.length > ZERO ?
        readinessDelay.recoverability :
        null,
    progressSignal: {
      attemptsSinceProgress: Number.isInteger(attemptsSinceProgress) ?
        Math.max(ZERO, attemptsSinceProgress) :
        null,
      maxAttempts:
        Number.isInteger(maxAttempts) && maxAttempts > ZERO ?
          Math.max(ZERO, maxAttempts) :
          null,
      stalled: noProgress?.stalled === true,
    },
    terminalReason:
      typeof noProgress?.reasonCode === 'string' &&
      noProgress.reasonCode.length > ZERO ?
        noProgress.reasonCode :
        null,
    source:
      typeof projectedFailure?.source === 'string' &&
      projectedFailure.source.length > ZERO ?
        projectedFailure.source :
        typeof readinessDelay?.source === 'string' &&
        readinessDelay.source.length > ZERO ?
          readinessDelay.source :
          null,
    cause:
      typeof projectedFailure?.cause === 'string' &&
      projectedFailure.cause.length > ZERO ?
        projectedFailure.cause :
        typeof readinessDelay?.cause === 'string' &&
        readinessDelay.cause.length > ZERO ?
          readinessDelay.cause :
          null,
    error:
      projectedFailure?.error === null ?
        null :
        typeof readinessDelay?.error === 'string' &&
        readinessDelay.error.length > ZERO ?
          readinessDelay.error :
          null,
  };
}

function isActiveWaitProgressSnapshot(value) {
  return value && typeof value === ACTIVE_WAIT_TYPE_OBJECT &&
    Array.isArray(value) !== true;
}

function isActiveWaitReadinessDelay(value) {
  return value && typeof value === ACTIVE_WAIT_TYPE_OBJECT &&
    Array.isArray(value) !== true;
}

function classifyActiveWaitReadinessDelayState(readinessDelay) {
  if (!isActiveWaitReadinessDelay(readinessDelay)) {
    return ACTIVE_WAIT_READINESS_DELAY_STATE.ABSENT;
  }
  return readinessDelay.timedOut === true ?
    ACTIVE_WAIT_READINESS_DELAY_STATE.TIMED_OUT :
    ACTIVE_WAIT_READINESS_DELAY_STATE.PRESENT;
}

function normalizeActiveWaitReadinessDelayEvidence({
  noProgress = null,
  progressSnapshot = null,
} = {}) {
  const noProgressReadinessDelay =
    isActiveWaitReadinessDelay(noProgress?.readinessDelay) ?
      noProgress.readinessDelay :
      null;
  const progressReadinessDelay =
    isActiveWaitReadinessDelay(progressSnapshot?.readinessDelay) ?
      progressSnapshot.readinessDelay :
      null;
  return Object.freeze({
    noProgressReadinessDelay,
    progressReadinessDelay,
    noProgressDelayState:
      classifyActiveWaitReadinessDelayState(noProgressReadinessDelay),
    progressDelayState:
      classifyActiveWaitReadinessDelayState(progressReadinessDelay),
  });
}

function selectActiveWaitReadinessDelay(options = {}) {
  const evidence = normalizeActiveWaitReadinessDelayEvidence(options);
  const decision = ACTIVE_WAIT_READINESS_DELAY_DECISION_TABLE.find((entry) =>
    entry.matches(evidence),
  );
  if (decision?.outcome.source === ACTIVE_WAIT_READINESS_DELAY_SOURCE.PROGRESS) {
    return evidence.progressReadinessDelay;
  }
  if (
    decision?.outcome.source === ACTIVE_WAIT_READINESS_DELAY_SOURCE.NO_PROGRESS
  ) {
    return evidence.noProgressReadinessDelay;
  }
  return null;
}

function normalizeActiveWaitProgressCoverageNodeCount(progressSnapshot) {
  return Number.isInteger(progressSnapshot?.snapshotCoverageNodeCount) &&
    progressSnapshot.snapshotCoverageNodeCount > ZERO ?
    progressSnapshot.snapshotCoverageNodeCount :
    ZERO;
}

function hasActiveWaitProgressSelectedSnapshotError(progressSnapshot) {
  return (
    typeof progressSnapshot?.selectedSnapshotError === 'string' &&
    progressSnapshot.selectedSnapshotError.length > ZERO
  );
}

function isBetterActiveWaitSnapshotCoverageProgressSnapshot(
  candidateSnapshot,
  selectedSnapshot,
) {
  const candidateCoverageNodeCount =
    normalizeActiveWaitProgressCoverageNodeCount(candidateSnapshot);
  if (candidateCoverageNodeCount === ZERO) {
    return false;
  }
  if (hasActiveWaitProgressSelectedSnapshotError(candidateSnapshot)) {
    return false;
  }
  const selectedCoverageNodeCount =
    normalizeActiveWaitProgressCoverageNodeCount(selectedSnapshot);
  return candidateCoverageNodeCount > selectedCoverageNodeCount;
}

function normalizeActiveWaitProgressPublicationStatusRank(progressSnapshot) {
  return Number.isInteger(progressSnapshot?.publicationStatusRank) &&
    progressSnapshot.publicationStatusRank >= ZERO ?
    progressSnapshot.publicationStatusRank :
    ZERO;
}

function normalizeActiveWaitProgressPublishedActiveCount(progressSnapshot) {
  return Number.isInteger(progressSnapshot?.selectedPublishedActiveCount) &&
    progressSnapshot.selectedPublishedActiveCount >= ZERO ?
    progressSnapshot.selectedPublishedActiveCount :
    ZERO;
}

function normalizeActiveWaitProgressActiveNodeCount(progressSnapshot) {
  return Number.isInteger(progressSnapshot?.activeNodeCount) &&
    progressSnapshot.activeNodeCount >= ZERO ?
    progressSnapshot.activeNodeCount :
    ZERO;
}

function normalizeActiveWaitProgressMissingPublishedCount(progressSnapshot) {
  return Number.isInteger(progressSnapshot?.missingPublishedCount) &&
    progressSnapshot.missingPublishedCount >= ZERO ?
    progressSnapshot.missingPublishedCount :
    ZERO;
}

function normalizeActiveWaitProgressPendingAckCount(progressSnapshot) {
  return Number.isInteger(progressSnapshot?.pendingAckCount) &&
    progressSnapshot.pendingAckCount >= ZERO ?
    progressSnapshot.pendingAckCount :
    ZERO;
}

function hasActiveWaitProgressClosureEvidence(progressSnapshot) {
  return (
    typeof progressSnapshot?.closureRecordId === 'string' &&
      progressSnapshot.closureRecordId.length > ZERO
  ) || (
    typeof progressSnapshot?.closureWitnessClass === 'string' &&
      progressSnapshot.closureWitnessClass.length > ZERO
  );
}

function intersectNormalizedStringIds(leftIds, rightIds) {
  const rightIdSet = new Set(normalizeDistinctStringArray(rightIds));
  return normalizeDistinctStringArray(leftIds).filter((leftId) =>
    rightIdSet.has(leftId),
  );
}

function normalizeTerminalPriorityRecoveryEvidencePartitionIds(
  progressSnapshot,
  evidence,
) {
  const progressClasses =
    progressSnapshot?.priorityRecoveryProgressClasses &&
    typeof progressSnapshot.priorityRecoveryProgressClasses === 'object' ?
      progressSnapshot.priorityRecoveryProgressClasses :
      {};
  const semanticStatePartitionIds = normalizeDistinctStringArray(
    progressClasses?.partitionIdsBySemanticState?.[evidence.semanticState],
  );
  if (typeof evidence.progressClass !== 'string') {
    return semanticStatePartitionIds;
  }
  const classPartitionIds = normalizeDistinctStringArray(
    progressClasses?.partitionIdsByClass?.[evidence.progressClass],
  );
  return intersectNormalizedStringIds(classPartitionIds, semanticStatePartitionIds);
}

function buildTerminalPriorityRecoveryRegressionEvidence(options = {}) {
  const currentProgressSnapshot = options.currentProgressSnapshot;
  const lastMeaningfulProgressSnapshot =
    options.lastMeaningfulProgressSnapshot;
  const currentNeedsOperationPartitionIds =
    normalizeTerminalPriorityRecoveryEvidencePartitionIds(
      currentProgressSnapshot,
      ACTIVE_WAIT_TERMINAL_PRIORITY_RECOVERY_EVIDENCE.NEEDS_OPERATION,
    );
  const lastOperationStalledPartitionIds =
    normalizeTerminalPriorityRecoveryEvidencePartitionIds(
      lastMeaningfulProgressSnapshot,
      ACTIVE_WAIT_TERMINAL_PRIORITY_RECOVERY_EVIDENCE.OPERATION_STALLED,
    );
  const lastRecoveringInFlightPartitionIds =
    normalizeTerminalPriorityRecoveryEvidencePartitionIds(
      lastMeaningfulProgressSnapshot,
      ACTIVE_WAIT_TERMINAL_PRIORITY_RECOVERY_EVIDENCE.RECOVERING_IN_FLIGHT,
    );
  const lastStrongOperationPartitionIds = normalizeDistinctStringArray([
    ...lastOperationStalledPartitionIds,
    ...lastRecoveringInFlightPartitionIds,
  ]);
  const sharedRegressedPartitionCount = intersectNormalizedStringIds(
    currentNeedsOperationPartitionIds,
    lastStrongOperationPartitionIds,
  ).length;
  const decision =
    ACTIVE_WAIT_TERMINAL_PRIORITY_RECOVERY_REGRESSION_TABLE.find((entry) =>
      entry.matches({sharedRegressedPartitionCount}),
    );
  return Object.freeze({
    currentNeedsOperationPartitionIds,
    lastOperationStalledPartitionIds,
    lastRecoveringInFlightPartitionIds,
    lastStrongOperationPartitionIds,
    sharedRegressedPartitionCount,
    decision: decision.decision,
    operationEvidenceRegression:
      decision.decision ===
        ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_LAST_MEANINGFUL,
  });
}

function normalizeStartupOwnerProgressDurationMs(value) {
  return Number.isFinite(value) && value > ZERO ?
    Math.max(ZERO, Math.floor(value)) :
    STARTUP_OWNER_PROGRESS_NO_EXTENSION_MS;
}

function isStartupOwnerProgressEvidenceRecord(value) {
  return value && typeof value === ACTIVE_WAIT_TYPE_OBJECT &&
    Array.isArray(value) !== true;
}

function selectStartupOwnerProgressEvidenceSnapshots(evidence = null) {
  return [
    ...(Array.isArray(evidence?.snapshots) ? evidence.snapshots : []),
    ...(Array.isArray(evidence?.partitionSnapshots) ?
      evidence.partitionSnapshots :
      []),
  ];
}

function hasStartupOwnerProgressEvidence(value) {
  return selectStartupOwnerProgressEvidenceSnapshots(value).length > ZERO;
}

function normalizeStartupSnapshotRepairDurationMs(value) {
  return Number.isFinite(value) && value > ZERO ?
    Math.max(ZERO, Math.floor(value)) :
    STARTUP_SNAPSHOT_REPAIR_NO_EXTENSION_MS;
}

function selectStartupOwnerProgressDecisionSnapshots(probeResult) {
  const snapshotCoverage =
    probeResult?.snapshotCoverage &&
    typeof probeResult.snapshotCoverage === ACTIVE_WAIT_TYPE_OBJECT ?
      probeResult.snapshotCoverage :
      {};
  const selectedSnapshots = [
    snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots,
    snapshotCoverage.priorityRecoveryDecisionSnapshots,
    probeResult?.publicationConvergenceGate?.priorityRecoveryDecisionSnapshots,
    snapshotCoverage.selectedPublicationConvergenceGate
      ?.priorityRecoveryDecisionSnapshots,
    snapshotCoverage.selectedPublicationConvergence
      ?.priorityRecoveryDecisionSnapshots,
    snapshotCoverage.selectedPriorityRecoveryObservation
      ?.priorityRecoveryCurrentSummary,
    snapshotCoverage.priorityRecoveryObservation?.priorityRecoveryCurrentSummary,
    probeResult?.publicationConvergenceGate?.priorityRecoveryCurrentSummary,
    snapshotCoverage.selectedPublicationConvergenceGate
      ?.priorityRecoveryCurrentSummary,
    snapshotCoverage.selectedPublicationConvergence
      ?.priorityRecoveryCurrentSummary,
  ];
  return selectedSnapshots
    .filter(hasStartupOwnerProgressEvidence)
    .flatMap(selectStartupOwnerProgressEvidenceSnapshots);
}

function hasStartupOwnerProgressPublicationLag(progressSnapshot) {
  return (
    progressSnapshot?.closureRecordId ===
      ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG ||
    progressSnapshot?.closureWitnessClass ===
      ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG
  );
}

function hasStartupOwnerProgressRecoveringState(progressSnapshot) {
  const semanticStateIds = normalizeDistinctStringArray(
    progressSnapshot?.priorityRecoveryProgressClasses
      ?.unresolvedSemanticStateIds,
  );
  return semanticStateIds.includes(
    STARTUP_OWNER_PROGRESS_SEMANTIC_RECOVERING,
  );
}

function hasStartupOwnerProgressPublishedRecovery(progressSnapshot) {
  return (
    progressSnapshot?.snapshotCoverageComplete === true &&
    progressSnapshot?.publicationStatus ===
      STARTUP_OWNER_PROGRESS_PUBLICATION_PUBLISHED &&
    normalizeActiveWaitProgressMissingPublishedCount(progressSnapshot) ===
      ZERO &&
    normalizeActiveWaitProgressPendingAckCount(progressSnapshot) === ZERO &&
    hasStartupOwnerProgressRecoveringState(progressSnapshot) === true
  );
}

function hasStartupOwnerProgressContinuationContext(progressSnapshot) {
  return (
    hasStartupOwnerProgressPublicationLag(progressSnapshot) === true ||
    hasStartupOwnerProgressPublishedRecovery(progressSnapshot) === true
  );
}

function isStartupOwnerProgressAction(action) {
  return (
    action === STARTUP_OWNER_PROGRESS_ACTION_ADVANCE ||
    action === STARTUP_OWNER_PROGRESS_ACTION_WAIT
  );
}

function resolveStartupOwnerProgressSemanticState(snapshot) {
  return snapshot?.semanticState || snapshot?.semanticStateId || null;
}

function resolveStartupOwnerProgressCurrentOwner(snapshot) {
  return snapshot?.progress?.currentOwner ||
    snapshot?.currentOwner ||
    snapshot?.actuation?.owner ||
    snapshot?.actuationOwner ||
    null;
}

function resolveStartupOwnerProgressBlockingBoundary(snapshot) {
  return snapshot?.progress?.blockingBoundary ||
    snapshot?.blockingBoundary ||
    null;
}

function resolveStartupOwnerProgressWaitMode(snapshot) {
  return snapshot?.progress?.waitMode || snapshot?.waitMode || null;
}

function resolveStartupOwnerProgressNextAction(snapshot) {
  return snapshot?.progress?.nextRequiredAction ||
    snapshot?.nextRequiredAction ||
    null;
}

function resolveStartupOwnerProgressStepAgeMs(snapshot) {
  return normalizeStartupOwnerProgressDurationMs(
    snapshot?.progress?.stepAgeMs ||
      snapshot?.actuation?.stepAgeMs ||
      snapshot?.stepAgeMs,
  );
}

function resolveStartupOwnerProgressStepTimeoutMs(snapshot) {
  return normalizeStartupOwnerProgressDurationMs(
    snapshot?.progress?.stepTimeoutMs ||
      snapshot?.actuation?.stepTimeoutMs ||
      snapshot?.stepTimeoutMs,
  );
}

function hasStartupOwnerProgressFreshnessEvidence(snapshot) {
  return (
    isStartupOwnerProgressEvidenceRecord(snapshot?.observation?.provenance) ||
    Number.isFinite(Number(snapshot?.snapshotCapturedAt)) ||
    Number.isFinite(Number(snapshot?.capturedAt)) ||
    Number.isFinite(Number(snapshot?.lastProgressAtMs)) ||
    Number.isFinite(Number(snapshot?.progress?.lastProgressAtMs)) ||
    Number.isFinite(Number(snapshot?.actuation?.lastProgressAtMs)) ||
    Number.isFinite(Number(snapshot?.topologyOperatorWitness?.lastObservedAtMs))
  );
}

function isStartupOwnerProgressWitness(snapshot) {
  return (
    resolveStartupOwnerProgressSemanticState(snapshot) ===
      STARTUP_OWNER_PROGRESS_SEMANTIC_RECOVERING &&
    resolveStartupOwnerProgressCurrentOwner(snapshot) ===
      STARTUP_OWNER_PROGRESS_OPERATION_OWNER &&
    resolveStartupOwnerProgressBlockingBoundary(snapshot) ===
      STARTUP_OWNER_PROGRESS_BOUNDARY_WORKFLOW &&
    resolveStartupOwnerProgressWaitMode(snapshot) ===
      STARTUP_OWNER_PROGRESS_WAIT_EVENT_DRIVEN &&
    isStartupOwnerProgressAction(resolveStartupOwnerProgressNextAction(snapshot))
  );
}

function resolveStartupOwnerProgressWitnessRemainingMs(snapshot) {
  const stepAgeMs = resolveStartupOwnerProgressStepAgeMs(snapshot);
  const stepTimeoutMs = resolveStartupOwnerProgressStepTimeoutMs(snapshot);
  return Math.max(STARTUP_OWNER_PROGRESS_NO_EXTENSION_MS, stepTimeoutMs - stepAgeMs);
}

function selectStartupActiveGateOwnerProgressContinuation({
  readinessMode = LOAD_READINESS_PHASE_UNSPECIFIED,
  progressSnapshot = null,
  probeResult = null,
  attemptsSinceProgress = ZERO,
  pollIntervalMs = ZERO,
} = {}) {
  if (
    readinessMode !== CLUSTER_READINESS_MODE_STARTUP ||
    hasStartupOwnerProgressContinuationContext(progressSnapshot) !== true
  ) {
    return Object.freeze({
      state: STARTUP_OWNER_PROGRESS_CONTINUATION_STATE.BLOCKED,
      continuePolling: false,
      reasonCode:
        STARTUP_OWNER_PROGRESS_CONTINUATION_REASON
          .OWNER_PROGRESS_CONTEXT_ABSENT,
      extendMs: STARTUP_OWNER_PROGRESS_NO_EXTENSION_MS,
    });
  }
  if (hasStartupOwnerProgressRecoveringState(progressSnapshot) !== true) {
    return Object.freeze({
      state: STARTUP_OWNER_PROGRESS_CONTINUATION_STATE.BLOCKED,
      continuePolling: false,
      reasonCode:
        STARTUP_OWNER_PROGRESS_CONTINUATION_REASON.RECOVERING_IN_FLIGHT_ABSENT,
      extendMs: STARTUP_OWNER_PROGRESS_NO_EXTENSION_MS,
    });
  }
  const ownerProgressWitnesses = selectStartupOwnerProgressDecisionSnapshots(
    probeResult,
  )
    .filter(isStartupOwnerProgressWitness);
  const witnessRemainingMs = ownerProgressWitnesses
    .map(resolveStartupOwnerProgressWitnessRemainingMs);
  if (witnessRemainingMs.length === ZERO) {
    return Object.freeze({
      state: STARTUP_OWNER_PROGRESS_CONTINUATION_STATE.BLOCKED,
      continuePolling: false,
      reasonCode: STARTUP_OWNER_PROGRESS_CONTINUATION_REASON.OWNER_WITNESS_ABSENT,
      extendMs: STARTUP_OWNER_PROGRESS_NO_EXTENSION_MS,
    });
  }
  const currentWitnessFresh =
    attemptsSinceProgress === ZERO ||
    ownerProgressWitnesses.some(hasStartupOwnerProgressFreshnessEvidence);
  if (currentWitnessFresh !== true) {
    return Object.freeze({
      state: STARTUP_OWNER_PROGRESS_CONTINUATION_STATE.BLOCKED,
      continuePolling: false,
      reasonCode: STARTUP_OWNER_PROGRESS_CONTINUATION_REASON.PROGRESS_NOT_FRESH,
      extendMs: STARTUP_OWNER_PROGRESS_NO_EXTENSION_MS,
    });
  }
  const minimumExtensionMs = normalizeStartupOwnerProgressDurationMs(
    pollIntervalMs,
  );
  return Object.freeze({
    state: STARTUP_OWNER_PROGRESS_CONTINUATION_STATE.CONTINUE,
    continuePolling: true,
    reasonCode: STARTUP_OWNER_PROGRESS_CONTINUATION_REASON.OWNER_STEP_DEADLINE,
    extendMs: Math.max(minimumExtensionMs, ...witnessRemainingMs),
  });
}

function hasStartupSnapshotRepairRetryEvidence(progressSnapshot) {
  return (
    progressSnapshot?.selectedSnapshotRepairDeferred === true &&
    progressSnapshot?.selectedSnapshotObservationMode ===
      STARTUP_SNAPSHOT_REPAIR_MODE_REPAIR_DEFERRED &&
    progressSnapshot?.selectedSnapshotObservationContractState ===
      STARTUP_SNAPSHOT_REPAIR_CONTRACT_DEFERRED &&
    progressSnapshot?.selectedSnapshotObservationRefreshState ===
      STARTUP_SNAPSHOT_REPAIR_CONTRACT_DEFERRED &&
    progressSnapshot?.selectedSnapshotObservationNextAction ===
      STARTUP_SNAPSHOT_REPAIR_NEXT_ACTION_RETRY &&
    normalizeStartupSnapshotRepairDurationMs(
      progressSnapshot?.selectedSnapshotObservationRetryAfterMs,
    ) > STARTUP_SNAPSHOT_REPAIR_NO_EXTENSION_MS
  );
}

function hasStartupSnapshotRepairOwnerHandoff(progressSnapshot) {
  return (
    progressSnapshot?.publicationActiveGateHandoffReasonCode ===
      STARTUP_SNAPSHOT_REPAIR_HANDOFF_REASON_OWNER_RECONCILE &&
    progressSnapshot?.publicationActiveGateHandoffNextAction ===
      STARTUP_SNAPSHOT_REPAIR_HANDOFF_ACTION_WAIT_OWNER_RECOVERY &&
    progressSnapshot?.publicationActiveGateHandoffRuntimePromotionAllowed !== true
  );
}

function hasStartupSnapshotRepairHandoffOutcome(progressSnapshot) {
  return (
    progressSnapshot?.membershipPublicationHandoffOutcomeState ===
      STARTUP_SNAPSHOT_REPAIR_HANDOFF_OUTCOME_WRITE_DEFERRED &&
    progressSnapshot?.membershipPublicationHandoffOutcomeReasonCode ===
      STARTUP_SNAPSHOT_REPAIR_HANDOFF_REASON_OWNER_RECONCILE &&
    progressSnapshot?.membershipPublicationHandoffOutcomeEnqueued === true &&
    normalizeStartupSnapshotRepairDurationMs(
      progressSnapshot?.membershipPublicationHandoffOutcomeRetryAfterMs,
    ) > STARTUP_SNAPSHOT_REPAIR_NO_EXTENSION_MS
  );
}

function hasStartupSnapshotRepairBoundedOwnerQueue(progressSnapshot) {
  const queueDepth = progressSnapshot?.selectedControlPlaneOwnerQueueDepth;
  const pendingWrites = Number.isFinite(queueDepth?.pendingWrites) ?
    Math.max(ZERO, Math.floor(queueDepth.pendingWrites)) :
    ZERO;
  const pendingWriteGrowthCount = Number.isFinite(
    queueDepth?.pendingWriteGrowthCount,
  ) ?
    Math.max(ZERO, Math.floor(queueDepth.pendingWriteGrowthCount)) :
    ZERO;
  return pendingWrites > ZERO && pendingWriteGrowthCount === ZERO;
}

function selectActiveGateSnapshotRepairContinuation({
  readinessMode = LOAD_READINESS_PHASE_UNSPECIFIED,
  progressSnapshot = null,
  pollIntervalMs = ZERO,
  allowedReadinessModes = ACTIVE_GATE_SNAPSHOT_REPAIR_STARTUP_READINESS_MODES,
} = {}) {
  if (allowedReadinessModes.includes(readinessMode) !== true) {
    return Object.freeze({
      state: STARTUP_SNAPSHOT_REPAIR_CONTINUATION_STATE.BLOCKED,
      continuePolling: false,
      reasonCode: ACTIVE_GATE_SNAPSHOT_REPAIR_MODE_UNSUPPORTED,
      extendMs: STARTUP_SNAPSHOT_REPAIR_NO_EXTENSION_MS,
    });
  }
  if (hasStartupSnapshotRepairRetryEvidence(progressSnapshot) !== true) {
    return Object.freeze({
      state: STARTUP_SNAPSHOT_REPAIR_CONTINUATION_STATE.BLOCKED,
      continuePolling: false,
      reasonCode:
        STARTUP_SNAPSHOT_REPAIR_CONTINUATION_REASON.SNAPSHOT_RETRY_ABSENT,
      extendMs: STARTUP_SNAPSHOT_REPAIR_NO_EXTENSION_MS,
    });
  }
  if (hasStartupSnapshotRepairOwnerHandoff(progressSnapshot) !== true) {
    return Object.freeze({
      state: STARTUP_SNAPSHOT_REPAIR_CONTINUATION_STATE.BLOCKED,
      continuePolling: false,
      reasonCode:
        STARTUP_SNAPSHOT_REPAIR_CONTINUATION_REASON.OWNER_HANDOFF_ABSENT,
      extendMs: STARTUP_SNAPSHOT_REPAIR_NO_EXTENSION_MS,
    });
  }
  if (hasStartupSnapshotRepairHandoffOutcome(progressSnapshot) !== true) {
    return Object.freeze({
      state: STARTUP_SNAPSHOT_REPAIR_CONTINUATION_STATE.BLOCKED,
      continuePolling: false,
      reasonCode:
        STARTUP_SNAPSHOT_REPAIR_CONTINUATION_REASON.HANDOFF_OUTCOME_ABSENT,
      extendMs: STARTUP_SNAPSHOT_REPAIR_NO_EXTENSION_MS,
    });
  }
  if (hasStartupSnapshotRepairBoundedOwnerQueue(progressSnapshot) !== true) {
    return Object.freeze({
      state: STARTUP_SNAPSHOT_REPAIR_CONTINUATION_STATE.BLOCKED,
      continuePolling: false,
      reasonCode:
        STARTUP_SNAPSHOT_REPAIR_CONTINUATION_REASON.OWNER_QUEUE_UNBOUNDED,
      extendMs: STARTUP_SNAPSHOT_REPAIR_NO_EXTENSION_MS,
    });
  }
  const snapshotRetryMs = normalizeStartupSnapshotRepairDurationMs(
    progressSnapshot?.selectedSnapshotObservationRetryAfterMs,
  );
  const handoffRetryMs = normalizeStartupSnapshotRepairDurationMs(
    progressSnapshot?.membershipPublicationHandoffOutcomeRetryAfterMs,
  );
  const minimumExtensionMs = normalizeStartupSnapshotRepairDurationMs(
    pollIntervalMs,
  );
  return Object.freeze({
    state: STARTUP_SNAPSHOT_REPAIR_CONTINUATION_STATE.CONTINUE,
    continuePolling: true,
    reasonCode:
      STARTUP_SNAPSHOT_REPAIR_CONTINUATION_REASON.SNAPSHOT_REPAIR_RETRY,
    extendMs: Math.max(minimumExtensionMs, snapshotRetryMs, handoffRetryMs),
  });
}

function selectStartupActiveGateSnapshotRepairContinuation(options = {}) {
  return selectActiveGateSnapshotRepairContinuation({
    ...options,
    allowedReadinessModes: ACTIVE_GATE_SNAPSHOT_REPAIR_STARTUP_READINESS_MODES,
  });
}

function selectLoadActiveGateSnapshotRepairContinuation(options = {}) {
  return selectActiveGateSnapshotRepairContinuation({
    ...options,
    allowedReadinessModes: ACTIVE_GATE_SNAPSHOT_REPAIR_LOAD_READINESS_MODES,
  });
}

function buildTerminalPublicationImprovementEvidence(options = {}) {
  const currentProgressSnapshot = options.currentProgressSnapshot;
  const lastMeaningfulProgressSnapshot =
    options.lastMeaningfulProgressSnapshot;
  const closureEvidenceImproved =
    hasActiveWaitProgressClosureEvidence(currentProgressSnapshot) === true &&
    hasActiveWaitProgressClosureEvidence(lastMeaningfulProgressSnapshot) !==
      true;
  const publicationStatusImproved =
    normalizeActiveWaitProgressPublicationStatusRank(currentProgressSnapshot) >
    normalizeActiveWaitProgressPublicationStatusRank(
      lastMeaningfulProgressSnapshot,
    );
  const publishedActiveCountImproved =
    normalizeActiveWaitProgressPublishedActiveCount(currentProgressSnapshot) >
    normalizeActiveWaitProgressPublishedActiveCount(
      lastMeaningfulProgressSnapshot,
    );
  const missingPublishedCountImproved =
    normalizeActiveWaitProgressMissingPublishedCount(currentProgressSnapshot) <
    normalizeActiveWaitProgressMissingPublishedCount(
      lastMeaningfulProgressSnapshot,
    );
  const pendingAckCountImproved =
    normalizeActiveWaitProgressPendingAckCount(currentProgressSnapshot) <
    normalizeActiveWaitProgressPendingAckCount(
      lastMeaningfulProgressSnapshot,
    );
  return Object.freeze({
    semanticPublicationImproved:
      closureEvidenceImproved === true ||
      publicationStatusImproved === true ||
      publishedActiveCountImproved === true ||
      missingPublishedCountImproved === true ||
      pendingAckCountImproved === true,
  });
}

function buildTerminalActiveWaitProgressEvidence({
  currentProgressSnapshot = null,
  lastMeaningfulProgressSnapshot = null,
  bestSnapshotCoverageProgressSnapshot = null,
} = {}) {
  const currentActiveNodeCount =
    normalizeActiveWaitProgressActiveNodeCount(currentProgressSnapshot);
  const lastMeaningfulActiveNodeCount =
    normalizeActiveWaitProgressActiveNodeCount(
      lastMeaningfulProgressSnapshot,
    );
  const currentSnapshotCoverageNodeCount =
    normalizeActiveWaitProgressCoverageNodeCount(currentProgressSnapshot);
  const lastMeaningfulCoverageNodeCount =
    normalizeActiveWaitProgressCoverageNodeCount(
      lastMeaningfulProgressSnapshot,
    );
  const bestSnapshotCoverageNodeCount =
    normalizeActiveWaitProgressCoverageNodeCount(
      bestSnapshotCoverageProgressSnapshot,
    );
  const currentSnapshotErrorPresent =
    typeof currentProgressSnapshot?.selectedSnapshotError === 'string' &&
    currentProgressSnapshot.selectedSnapshotError.length > ZERO;
  const priorityRecoveryRegressionEvidence =
    buildTerminalPriorityRecoveryRegressionEvidence({
      currentProgressSnapshot,
      lastMeaningfulProgressSnapshot,
    });
  const publicationImprovementEvidence =
    buildTerminalPublicationImprovementEvidence({
      currentProgressSnapshot,
      lastMeaningfulProgressSnapshot,
    });
  const bestSnapshotCoveragePublicationImprovementEvidence =
    buildTerminalPublicationImprovementEvidence({
      currentProgressSnapshot,
      lastMeaningfulProgressSnapshot: bestSnapshotCoverageProgressSnapshot,
    });
  return {
    currentProgressPresent:
      isActiveWaitProgressSnapshot(currentProgressSnapshot),
    lastMeaningfulProgressPresent:
      isActiveWaitProgressSnapshot(lastMeaningfulProgressSnapshot),
    bestSnapshotCoverageProgressPresent:
      isActiveWaitProgressSnapshot(bestSnapshotCoverageProgressSnapshot),
    currentActiveNodeCount,
    lastMeaningfulActiveNodeCount,
    currentSnapshotCoverageNodeCount,
    lastMeaningfulCoverageNodeCount,
    bestSnapshotCoverageNodeCount,
    currentSnapshotZeroCoverageRegression:
      isActiveWaitProgressSnapshot(currentProgressSnapshot) &&
      isActiveWaitProgressSnapshot(lastMeaningfulProgressSnapshot) &&
      currentProgressSnapshot.snapshotCoverageComplete !== true &&
      currentSnapshotCoverageNodeCount === ZERO &&
      currentSnapshotErrorPresent === true,
    coverageRegressionWithoutPublicationImprovement:
      isActiveWaitProgressSnapshot(currentProgressSnapshot) &&
      isActiveWaitProgressSnapshot(lastMeaningfulProgressSnapshot) &&
      currentSnapshotCoverageNodeCount < lastMeaningfulCoverageNodeCount &&
      publicationImprovementEvidence.semanticPublicationImproved !== true,
    bestSnapshotCoverageRegressionWithoutPublicationImprovement:
      isActiveWaitProgressSnapshot(currentProgressSnapshot) &&
      isActiveWaitProgressSnapshot(bestSnapshotCoverageProgressSnapshot) &&
      currentSnapshotCoverageNodeCount < bestSnapshotCoverageNodeCount &&
      bestSnapshotCoveragePublicationImprovementEvidence
        .semanticPublicationImproved !== true,
    activeRegressionWithoutPublicationImprovement:
      isActiveWaitProgressSnapshot(currentProgressSnapshot) &&
      isActiveWaitProgressSnapshot(lastMeaningfulProgressSnapshot) &&
      currentActiveNodeCount < lastMeaningfulActiveNodeCount &&
      publicationImprovementEvidence.semanticPublicationImproved !== true,
    currentPriorityRecoveryOperationEvidenceRegression:
      priorityRecoveryRegressionEvidence.operationEvidenceRegression,
  };
}

function selectTerminalActiveWaitProgressSnapshot({
  currentProgressSnapshot = null,
  lastMeaningfulProgressSnapshot = null,
  bestSnapshotCoverageProgressSnapshot = null,
} = {}) {
  const evidence = buildTerminalActiveWaitProgressEvidence({
    currentProgressSnapshot,
    lastMeaningfulProgressSnapshot,
    bestSnapshotCoverageProgressSnapshot,
  });
  if (evidence.currentProgressPresent !== true) {
    return evidence.lastMeaningfulProgressPresent === true ?
      lastMeaningfulProgressSnapshot :
      null;
  }
  const decision = ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_TABLE.find((entry) =>
    entry.matches(evidence),
  );
  if (
    decision?.decision ===
    ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_BEST_SNAPSHOT_COVERAGE
  ) {
    return bestSnapshotCoverageProgressSnapshot;
  }
  return decision?.decision ===
    ACTIVE_WAIT_TERMINAL_PROGRESS_DECISION_LAST_MEANINGFUL ?
    lastMeaningfulProgressSnapshot :
    currentProgressSnapshot;
}

export {
  LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
  LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE,
  LOAD_READINESS_STABLE_WINDOW_STATE_PENDING,
  buildActiveWaitReadinessFailure,
  buildLoadReadinessStableWindowFailure,
  decideLoadReadinessStableWindow,
  isBetterActiveWaitSnapshotCoverageProgressSnapshot,
  normalizeLoadReadinessPhase,
  normalizeStableWindowTimestamp,
  selectActiveWaitReadinessDelay,
  selectLoadActiveGateSnapshotRepairContinuation,
  selectStartupActiveGateSnapshotRepairContinuation,
  selectStartupActiveGateOwnerProgressContinuation,
  selectTerminalActiveWaitProgressSnapshot,
};
