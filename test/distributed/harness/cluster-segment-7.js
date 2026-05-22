import {CLUSTER_SEGMENT_6} from './cluster-segment-6.js';
import {Cluster5} from './cluster-segment-7-class-5.js';
import {ASSERTIONS_SEGMENT_2} from './assertions-segment-2.js';
const {runFinalAdjudication} = ASSERTIONS_SEGMENT_2;

import {
  LIFECYCLE_REASON,
} from '../../../src/bootstrap/lifecycle-controller-constants.js';
import {
  buildPriorityRecoveryActiveGateSnapshot,
  derivePriorityRecoveryActiveGateReportFields,
  PRIORITY_RECOVERY_ACTIVE_GATE_STATE,
} from './active-gate-contract.js';

const {
  ACTIVE_POLL_INTERVAL_MS,
  ACTIVE_STATE,
  ACTIVE_WAIT_INACTIVE_SUMMARY_ERROR_PREFIX,
  ACTIVE_WAIT_INACTIVE_SUMMARY_STATE_PREFIX,
  ACTIVE_WAIT_INVARIANT_BREACH_MESSAGE_PREFIX,
  ACTIVE_WAIT_INVARIANT_BREACH_REASON_CODE,
  ACTIVE_WAIT_NO_PROGRESS_CLASS_CODE,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX,
  ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS,
  ACTIVE_WAIT_STALLED_MESSAGE_PREFIX,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  CLUSTER_STAGE_LOAD_READINESS_STABLE,
  CLUSTER_STAGE_LOAD_READINESS_WAITING,
  CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  CONTAINER_LOG_TAIL_LINES,
  LOG_COLLECTION_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  STARTUP_ADMISSION_STATE_BLOCKED,
  STARTUP_ADMISSION_STATE_DEGRADED,
  STARTUP_ADMISSION_STATE_STRONG_ACTIVE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  STATUS_ACTIVE_LOWER,
  TIMEOUTS,
  UNKNOWN_REASON,
  UNKNOWN_STATE,
  ONE,
  ZERO,
  buildActiveGateWaitPolicy,
  buildActiveWaitProgressSnapshot,
  formatActiveWaitProgressSnapshot,
  formatCountSummary,
  formatNodeDiagnostics,
  formatPublicationConvergenceGate,
  formatSnapshotCoverage,
  normalizeDistinctStringArray,
  pollUntilCondition,
  scoreActiveWaitProgress,
  summarizeActiveWaitBlockerHistory,
  summarizeInvariantBreaches,
  upsertActiveWaitBlockerHistory,
  withTimeout,
} = CLUSTER_SEGMENT_6;

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
  if (
    isStableWindowTimestampAvailable(snapshotStartedAt) &&
    (
      snapshotStartedAt.timestampMs < observedStartedAt.timestampMs ?
        mayBackdateToSnapshot :
        true
    )
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
  const classCode =
    timedOut &&
    typeof readinessDelay?.cause === 'string' &&
    readinessDelay.cause.length > ZERO ?
      readinessDelay.cause :
      noProgress?.reasonCode === ACTIVE_WAIT_NO_PROGRESS_REASON_CODE ||
          noProgress?.stalled === true ?
        ACTIVE_WAIT_NO_PROGRESS_CLASS_CODE :
        null;
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
      typeof readinessDelay?.source === 'string' &&
      readinessDelay.source.length > ZERO ?
        readinessDelay.source :
        null,
    cause:
      typeof readinessDelay?.cause === 'string' &&
      readinessDelay.cause.length > ZERO ?
        readinessDelay.cause :
        null,
    error:
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

class Cluster extends Cluster5 {
  async _waitForAllActive(options = {}) {
    const readinessMode =
      options.mode === CLUSTER_READINESS_MODE_LOAD ?
        CLUSTER_READINESS_MODE_LOAD :
        CLUSTER_READINESS_MODE_STARTUP;
    const timeoutOverrideMs = Number(options.timeoutMs);
    const timeout =
      Number.isFinite(timeoutOverrideMs) && timeoutOverrideMs >= MIN_TIMEOUT_MS ?
        Math.floor(timeoutOverrideMs) :
        this._resolveActiveWaitTimeoutMs();
    const deadline = Date.now() + timeout;
    const forceRepairAfterMs = Number.isFinite(
      this._config?.timeouts?.activeWaitForceRepairAfter,
    ) ?
      Math.max(ZERO, this._config.timeouts.activeWaitForceRepairAfter) :
      TIMEOUTS.ACTIVE_WAIT_FORCE_REPAIR_AFTER;
    const noProgressMaxAttempts =
      readinessMode === CLUSTER_READINESS_MODE_LOAD ?
        this._resolveActiveWaitNoProgressMaxAttempts(options, timeout) :
        null;
    const forceRepairThreshold = Date.now() + forceRepairAfterMs;
    const inactiveSummaryCounts = new Map();
    const blockerHistoryBySignature = new Map();
    let bestProgressSnapshot = null;
    let bestProgressScore = Number.NEGATIVE_INFINITY;
    let bestSnapshotCoverageProgressSnapshot = null;
    let lastMeaningfulProgressAttempt = ZERO;
    let lastMeaningfulProgressElapsedMs = ZERO;
    let lastMeaningfulProgressSnapshot = null;
    let lastObservedProgressSnapshot = null;
    let lastObservedAttempt = ZERO;
    let lastObservedElapsedMs = ZERO;

    const summarizeAdmissionState = (nodeDiagnostics = []) => {
      const summary = {
        [STARTUP_ADMISSION_STATE_STRONG_ACTIVE]: ZERO,
        [STARTUP_ADMISSION_STATE_DEGRADED]: ZERO,
        [STARTUP_ADMISSION_STATE_BLOCKED]: ZERO,
      };
      for (const diagnostic of nodeDiagnostics) {
        const state =
          typeof diagnostic?.admissionState === 'string' &&
          Object.prototype.hasOwnProperty.call(
            summary,
            diagnostic.admissionState,
          ) ?
            diagnostic.admissionState :
            'unknown';
        summary[state] = (summary[state] || ZERO) + 1;
      }
      for (const [state, count] of Object.entries(summary)) {
        if (count === ZERO) {
          delete summary[state];
        }
      }
      return summary;
    };

    const resolveActiveGateWaitPolicy = (result) => {
      const progressSnapshot = buildActiveWaitProgressSnapshot(
        result,
        this._nodes.size,
        {readinessMode},
      );
      return buildActiveGateWaitPolicy({
        readinessMode,
        closureRecordId: progressSnapshot?.closureRecordId || null,
      });
    };

    const buildNoProgressDetails = (
      attempts,
      elapsedMs,
      stalled,
      progressSnapshot,
    ) => {
      const noProgressBudgetEnabled =
        Number.isInteger(noProgressMaxAttempts) && noProgressMaxAttempts > ZERO;
      const coordinatorCyclesSinceProgress = Math.max(
        ZERO,
        attempts - (lastMeaningfulProgressAttempt || ZERO),
      );
      return {
        enabled: noProgressBudgetEnabled,
        mode: readinessMode,
        maxAttempts: noProgressBudgetEnabled ? noProgressMaxAttempts : null,
        maxCoordinatorCycles: noProgressBudgetEnabled ?
          noProgressMaxAttempts :
          null,
        attemptsSinceProgress: coordinatorCyclesSinceProgress,
        coordinatorCyclesSinceProgress,
        stalled: stalled === true,
        lastMeaningfulProgressAttempt: lastMeaningfulProgressAttempt || null,
        lastMeaningfulProgressElapsedMs:
          lastMeaningfulProgressElapsedMs || null,
        lastMeaningfulProgress: lastMeaningfulProgressSnapshot || null,
        currentProgress: progressSnapshot || null,
        closureRecordId: progressSnapshot?.closureRecordId || null,
        closureWitnessClass: progressSnapshot?.closureWitnessClass || null,
        readinessDelay: progressSnapshot?.readinessDelay || null,
      };
    };
    const buildActiveGateDetails = ({
      state = PRIORITY_RECOVERY_ACTIVE_GATE_STATE.WAITING,
      attempts = ZERO,
      elapsedMs = ZERO,
      progressSnapshot = null,
      noProgress = null,
      readinessFailure = null,
      reasonCode = null,
      stalledReason = null,
      failedNoProgress = null,
      lastMeaningfulChange = null,
      lastProgressEvent = null,
      blockerHistory = [],
      admissionState = null,
      waitPolicy = null,
    } = {}) => {
      const attemptsSinceProgress = Math.max(
        ZERO,
        attempts - (lastMeaningfulProgressAttempt || ZERO),
      );
      const readinessDelay = selectActiveWaitReadinessDelay({
        noProgress,
        progressSnapshot,
      });
      const maxAttempts =
        Number.isInteger(noProgress?.maxAttempts) &&
        noProgress.maxAttempts > ZERO ?
          Math.max(ZERO, noProgress.maxAttempts) :
          Number.isInteger(noProgressMaxAttempts) &&
              noProgressMaxAttempts > ZERO ?
            Math.max(ZERO, noProgressMaxAttempts) :
            null;
      const activeGate = buildPriorityRecoveryActiveGateSnapshot({
        mode: readinessMode,
        state,
        attempts,
        elapsedMs,
        maxAttempts,
        maxCoordinatorCycles: maxAttempts,
        attemptsSinceProgress,
        coordinatorCyclesSinceProgress: attemptsSinceProgress,
        lastMeaningfulProgressAttempt: lastMeaningfulProgressAttempt || null,
        lastMeaningfulProgressElapsedMs:
          lastMeaningfulProgressElapsedMs || null,
        closureRecordId: progressSnapshot?.closureRecordId || null,
        closureWitnessClass: progressSnapshot?.closureWitnessClass || null,
        reasonCode,
        stalledReason,
        progress: progressSnapshot,
        bestProgress: bestProgressSnapshot || null,
        blockerHistory,
        admissionState,
        waitPolicy,
        readinessDelay,
        readinessFailure,
        lastMeaningfulProgress: lastMeaningfulProgressSnapshot || null,
        lastMeaningfulChange,
        lastProgressEvent,
        failedNoProgress,
        invariantBreached:
          state === PRIORITY_RECOVERY_ACTIVE_GATE_STATE.INVARIANT_BREACHED,
        stalled: state === PRIORITY_RECOVERY_ACTIVE_GATE_STATE.STALLED,
        timedOut: state === PRIORITY_RECOVERY_ACTIVE_GATE_STATE.TIMED_OUT,
      });
      return {
        activeGate,
        ...derivePriorityRecoveryActiveGateReportFields(activeGate),
      };
    };

    const buildWaitingDetails = (attempts, elapsedMs, lastResult) => {
      const progressSnapshot = buildActiveWaitProgressSnapshot(
        lastResult,
        this._nodes.size,
        {readinessMode},
      );
      const invariantBreaches = summarizeInvariantBreaches(
        lastResult?.priorityRecoveryInvariants?.invariants,
      );
      const progressScore = scoreActiveWaitProgress(progressSnapshot);
      const meaningfulProgressObserved = progressScore > bestProgressScore;
      if (meaningfulProgressObserved) {
        bestProgressScore = progressScore;
        bestProgressSnapshot = progressSnapshot;
        lastMeaningfulProgressAttempt = attempts;
        lastMeaningfulProgressElapsedMs = elapsedMs;
        lastMeaningfulProgressSnapshot = progressSnapshot;
      }
      if (
        isBetterActiveWaitSnapshotCoverageProgressSnapshot(
          progressSnapshot,
          bestSnapshotCoverageProgressSnapshot,
        )
      ) {
        bestSnapshotCoverageProgressSnapshot = progressSnapshot;
      }

      upsertActiveWaitBlockerHistory(
        blockerHistoryBySignature,
        progressSnapshot,
        attempts,
        elapsedMs,
      );
      lastObservedProgressSnapshot = progressSnapshot;
      lastObservedAttempt = attempts;
      lastObservedElapsedMs = elapsedMs;

      const attemptsSinceProgress = Math.max(
        ZERO,
        attempts - (lastMeaningfulProgressAttempt || ZERO),
      );
      const blockerHistory = summarizeActiveWaitBlockerHistory(
        blockerHistoryBySignature,
      );
      const noProgress = buildNoProgressDetails(
        attempts,
        elapsedMs,
        false,
        progressSnapshot,
      );
      const activeGateDetails = buildActiveGateDetails({
        attempts,
        elapsedMs,
        progressSnapshot,
        noProgress,
        blockerHistory,
        admissionState: summarizeAdmissionState(lastResult?.nodeDiagnostics || []),
        waitPolicy: resolveActiveGateWaitPolicy(lastResult),
      });
      const waitingDetails = {
        nodeDiagnostics: lastResult?.nodeDiagnostics || [],
        snapshotCoverage: lastResult?.snapshotCoverage || null,
        publicationConvergenceGate:
          lastResult?.publicationConvergenceGate || null,
        priorityRecoveryInvariants:
          lastResult?.priorityRecoveryInvariants || null,
        invariantBreaches,
        ...activeGateDetails,
      };

      return {
        waitingDetails,
        invariantBreaches,
        progressSnapshot,
        attemptsSinceProgress,
        blockerHistory,
      };
    };

    let pollResult;
    try {
      pollResult = await pollUntilCondition({
        deadline,
        intervalMs: ACTIVE_POLL_INTERVAL_MS,
        sleep: (ms) => this._sleep(ms),
        probe: () => {
          const forceRepair = Date.now() >= forceRepairThreshold;
          return this._probeClusterActiveState(deadline, {
            mode: readinessMode,
            forceRepair,
          });
        },
        isSuccess: (result) => {
          return (
            result?.allActive === true ||
            (result?.priorityRecoveryInvariants?.passed === true &&
              resolveActiveGateWaitPolicy(result).allowSoftSuccess === true)
          );
        },
        onAttempt: ({attempts, elapsedMs, lastResult}) => {
          for (const diagnostic of lastResult.nodeDiagnostics || []) {
            if (diagnostic.active === true) {
              continue;
            }
            const summaryKey = diagnostic.error ?
              ACTIVE_WAIT_INACTIVE_SUMMARY_ERROR_PREFIX + diagnostic.error :
              ACTIVE_WAIT_INACTIVE_SUMMARY_STATE_PREFIX +
                (diagnostic.state || UNKNOWN_STATE);
            inactiveSummaryCounts.set(
              summaryKey,
              (inactiveSummaryCounts.get(summaryKey) || ZERO) + 1,
            );
          }

          const waitingProgress = buildWaitingDetails(
            attempts,
            elapsedMs,
            lastResult,
          );

          this._recordPeriodicStartupWaitingStage(
            CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
            {
              attempts,
              elapsedMs,
            },
            waitingProgress.waitingDetails,
          );

          if (waitingProgress.invariantBreaches.hardCount > ZERO) {
            const hardReasonCodes =
              waitingProgress.invariantBreaches.hardBreaches
                .map((entry) => String(entry?.reasonCode || '').trim())
                .filter((reasonCode) => reasonCode.length > ZERO);
            const hardInvariantIds =
              waitingProgress.invariantBreaches.hardBreaches
                .map((entry) => String(entry?.invariantId || '').trim())
                .filter((invariantId) => invariantId.length > ZERO);
            const invariantFailureDetails = {
              reasonCode: ACTIVE_WAIT_INVARIANT_BREACH_REASON_CODE,
              mode: readinessMode,
              attempts,
              elapsedMs,
              hardReasonCodes,
              hardInvariantIds,
              invariantBreaches: waitingProgress.invariantBreaches,
            };
            this._recordClusterStage(
              CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
              {
                attempts,
                elapsedMs,
                ...waitingProgress.waitingDetails,
                invariantFailure: invariantFailureDetails,
              },
            );
            const invariantError = new Error(
              ACTIVE_WAIT_INVARIANT_BREACH_MESSAGE_PREFIX +
                '(mode=' +
                readinessMode +
                ', reasonCodes=' +
                (hardReasonCodes.length > ZERO ?
                  hardReasonCodes.join('|') :
                  UNKNOWN_REASON) +
                ', invariantIds=' +
                (hardInvariantIds.length > ZERO ?
                  hardInvariantIds.join('|') :
                  UNKNOWN_REASON) +
                ')',
            );
            const invariantProgressSnapshot = buildNoProgressDetails(
              attempts,
              elapsedMs,
              false,
              waitingProgress.progressSnapshot,
            );
            const invariantActiveGateDetails = buildActiveGateDetails({
              state: PRIORITY_RECOVERY_ACTIVE_GATE_STATE.INVARIANT_BREACHED,
              attempts,
              elapsedMs,
              progressSnapshot: waitingProgress.progressSnapshot,
              noProgress: invariantProgressSnapshot,
              readinessFailure: buildActiveWaitReadinessFailure({
                mode: readinessMode,
                noProgress: invariantProgressSnapshot,
                attemptsSinceProgress:
                  waitingProgress.attemptsSinceProgress,
                maxAttempts: noProgressMaxAttempts,
              }),
              reasonCode: ACTIVE_WAIT_INVARIANT_BREACH_REASON_CODE,
              blockerHistory: waitingProgress.blockerHistory,
              admissionState: waitingProgress.waitingDetails.activeGateAdmissionState,
              waitPolicy: resolveActiveGateWaitPolicy(lastResult),
            });
            invariantError.diagnostics = {
              reasonCode: ACTIVE_WAIT_INVARIANT_BREACH_REASON_CODE,
              invariantBreaches: waitingProgress.invariantBreaches,
              priorityRecoveryInvariants:
                lastResult?.priorityRecoveryInvariants || null,
              activeGate: invariantActiveGateDetails.activeGate,
              noProgress: invariantProgressSnapshot ?
                {
                  ...invariantProgressSnapshot,
                  readinessFailure: buildActiveWaitReadinessFailure({
                    mode: readinessMode,
                    noProgress: invariantProgressSnapshot,
                    attemptsSinceProgress:
                        waitingProgress.attemptsSinceProgress,
                    maxAttempts: noProgressMaxAttempts,
                  }),
                } :
                null,
            };
            invariantError.invariantBreaches =
              waitingProgress.invariantBreaches;
            throw invariantError;
          }

          if (
            Number.isInteger(noProgressMaxAttempts) &&
            noProgressMaxAttempts > ZERO &&
            waitingProgress.attemptsSinceProgress >= noProgressMaxAttempts
          ) {
            const stalledCoordinatorCycles =
              waitingProgress.attemptsSinceProgress;
            const stalledProgressSnapshot =
              selectTerminalActiveWaitProgressSnapshot({
                currentProgressSnapshot: waitingProgress.progressSnapshot,
                lastMeaningfulProgressSnapshot,
                bestSnapshotCoverageProgressSnapshot,
              });
            const stalledProgress = buildNoProgressDetails(
              attempts,
              elapsedMs,
              true,
              stalledProgressSnapshot,
            );
            const stalledNoProgress = {
              ...stalledProgress,
              readinessFailure: buildActiveWaitReadinessFailure({
                mode: readinessMode,
                noProgress: stalledProgress,
                attemptsSinceProgress: stalledCoordinatorCycles,
                maxAttempts: noProgressMaxAttempts,
              }),
              reasonCode: ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
              stalledReason:
                ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX +
                String(stalledCoordinatorCycles),
              failedNoProgress: {
                phase: CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
                details: {
                  mode: readinessMode,
                  budgetCoordinatorCycles: noProgressMaxAttempts,
                  budgetAttempts: noProgressMaxAttempts,
                  attempts,
                  elapsedMs,
                  attemptsSinceProgress: stalledCoordinatorCycles,
                  coordinatorCyclesSinceProgress: stalledCoordinatorCycles,
                },
              },
              lastMeaningfulChange:
                lastMeaningfulProgressSnapshot &&
                typeof lastMeaningfulProgressSnapshot === 'object' ?
                  {
                    attempt: lastMeaningfulProgressAttempt,
                    elapsedMs: lastMeaningfulProgressElapsedMs,
                    message: formatActiveWaitProgressSnapshot(
                      lastMeaningfulProgressSnapshot,
                    ),
                  } :
                  null,
              lastProgressEvent:
                waitingProgress.progressSnapshot &&
                typeof waitingProgress.progressSnapshot === 'object' ?
                  {
                    attempt: attempts,
                    elapsedMs,
                    message: formatActiveWaitProgressSnapshot(
                      waitingProgress.progressSnapshot,
                    ),
                  } :
                  null,
            };
            const stalledActiveGateDetails = buildActiveGateDetails({
              state: PRIORITY_RECOVERY_ACTIVE_GATE_STATE.STALLED,
              attempts,
              elapsedMs,
              progressSnapshot: stalledProgressSnapshot,
              noProgress: stalledNoProgress,
              readinessFailure: stalledNoProgress.readinessFailure,
              reasonCode: stalledNoProgress.reasonCode,
              stalledReason: stalledNoProgress.stalledReason,
              failedNoProgress: stalledNoProgress.failedNoProgress,
              lastMeaningfulChange: stalledNoProgress.lastMeaningfulChange,
              lastProgressEvent: stalledNoProgress.lastProgressEvent,
              blockerHistory: waitingProgress.blockerHistory,
              admissionState: waitingProgress.waitingDetails.activeGateAdmissionState,
              waitPolicy: resolveActiveGateWaitPolicy(lastResult),
            });
            this._recordClusterStage(
              CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
              {
                attempts,
                elapsedMs,
                ...waitingProgress.waitingDetails,
                ...stalledActiveGateDetails,
              },
            );
            const stalledError = new Error(
              ACTIVE_WAIT_STALLED_MESSAGE_PREFIX +
                'for ' +
                String(stalledCoordinatorCycles) +
                ' attempts (mode=' +
                readinessMode +
                ', progress=' +
                formatActiveWaitProgressSnapshot(
                  stalledProgressSnapshot,
                ) +
                ')',
            );
            stalledError.diagnostics = {
              activeGate: stalledActiveGateDetails.activeGate,
              noProgress: stalledNoProgress,
              invariantBreaches: waitingProgress.invariantBreaches,
              priorityRecoveryInvariants:
                lastResult?.priorityRecoveryInvariants || null,
            };
            throw stalledError;
          }
        },
      });
    } catch (error) {
      try {
        await this._collectFailureLogs();
      } catch (_collectFailureLogsError) {
        // Best effort log collection only.
      }
      throw error;
    }

    if (pollResult.success) {
      const successProgressSnapshot =
        buildActiveWaitProgressSnapshot(
          pollResult.lastResult || {},
          this._nodes.size,
          {readinessMode},
        ) ||
        lastObservedProgressSnapshot;
      const successBlockerHistory = summarizeActiveWaitBlockerHistory(
        blockerHistoryBySignature,
      );
      const successNoProgress = buildNoProgressDetails(
        pollResult.attempts,
        pollResult.elapsedMs,
        false,
        successProgressSnapshot,
      );
      const successWaitPolicy = resolveActiveGateWaitPolicy(
        pollResult.lastResult,
      );
      const successActiveGateDetails = buildActiveGateDetails({
        state:
          pollResult.lastResult?.allActive === true ?
            PRIORITY_RECOVERY_ACTIVE_GATE_STATE.READY :
            PRIORITY_RECOVERY_ACTIVE_GATE_STATE.SOFT_READY,
        attempts: pollResult.attempts,
        elapsedMs: pollResult.elapsedMs,
        progressSnapshot: successProgressSnapshot,
        noProgress: successNoProgress,
        blockerHistory: successBlockerHistory,
        admissionState: summarizeAdmissionState(
          pollResult.lastResult?.nodeDiagnostics || [],
        ),
        waitPolicy: successWaitPolicy,
      });
      this._recordClusterStage(CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE, {
        attempts: pollResult.attempts,
        elapsedMs: pollResult.elapsedMs,
        nodeDiagnostics: pollResult.lastResult?.nodeDiagnostics || [],
        snapshotCoverage: pollResult.lastResult?.snapshotCoverage || null,
        publicationConvergenceGate:
          pollResult.lastResult?.publicationConvergenceGate || null,
        priorityRecoveryInvariants:
          pollResult.lastResult?.priorityRecoveryInvariants || null,
        invariantBreaches: summarizeInvariantBreaches(
          pollResult.lastResult?.priorityRecoveryInvariants?.invariants,
        ),
        ...successActiveGateDetails,
      });
      return successActiveGateDetails.activeGate;
    }

    await this._collectFailureLogs();
    const nodeDiagnosticsSummary = formatNodeDiagnostics(
      pollResult.lastResult?.nodeDiagnostics || [],
    );
    const inactiveSummary = formatCountSummary(inactiveSummaryCounts);
    const snapshotCoverageSummary = formatSnapshotCoverage(
      pollResult.lastResult?.snapshotCoverage || null,
    );
    const priorityRecoveryFailingInvariantIds = normalizeDistinctStringArray(
      pollResult.lastResult?.priorityRecoveryInvariants?.failingInvariantIds,
    );
    const priorityRecoveryInvariantBreaches = summarizeInvariantBreaches(
      pollResult.lastResult?.priorityRecoveryInvariants?.invariants,
    );
    const observedFinalProgressSnapshot =
      lastObservedProgressSnapshot ||
      buildActiveWaitProgressSnapshot(
        pollResult.lastResult || {},
        this._nodes.size,
        {readinessMode},
      );
    const terminalProgressSnapshot = selectTerminalActiveWaitProgressSnapshot({
      currentProgressSnapshot: observedFinalProgressSnapshot,
      lastMeaningfulProgressSnapshot,
      bestSnapshotCoverageProgressSnapshot,
    });
    const terminalPublicationConvergenceEvidence = {
      progressSnapshot: terminalProgressSnapshot,
    };
    const publicationConvergenceSummary = formatPublicationConvergenceGate(
      pollResult.lastResult?.publicationConvergenceGate || null,
      terminalPublicationConvergenceEvidence,
    );
    const finalAttemptsSinceProgress = Math.max(
      ZERO,
      pollResult.attempts - (lastMeaningfulProgressAttempt || ZERO),
    );
    const finalNoProgress = buildNoProgressDetails(
      pollResult.attempts,
      pollResult.elapsedMs,
      false,
      observedFinalProgressSnapshot,
    );
    const finalNoProgressWithReasonCode = finalNoProgress ?
      {
        ...finalNoProgress,
        reasonCode: ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
      } :
      null;
    const finalNoProgressOwnerOutcome = finalNoProgressWithReasonCode ?
      {
        ...finalNoProgressWithReasonCode,
        readinessDelay: selectActiveWaitReadinessDelay({
          noProgress: finalNoProgressWithReasonCode,
          progressSnapshot: terminalProgressSnapshot,
        }),
      } :
      null;
    const finalReadinessFailure = finalNoProgressOwnerOutcome ?
      buildActiveWaitReadinessFailure({
        mode: readinessMode,
        noProgress: finalNoProgressOwnerOutcome,
        attemptsSinceProgress: finalAttemptsSinceProgress,
        maxAttempts: noProgressMaxAttempts,
      }) :
      null;
    const timeoutActiveGateDetails = buildActiveGateDetails({
      state: PRIORITY_RECOVERY_ACTIVE_GATE_STATE.TIMED_OUT,
      attempts: pollResult.attempts,
      elapsedMs: pollResult.elapsedMs,
      progressSnapshot: terminalProgressSnapshot,
      noProgress: finalNoProgressOwnerOutcome,
      readinessFailure: finalReadinessFailure,
      reasonCode: ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
      stalledReason:
        ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX +
        String(finalAttemptsSinceProgress),
      failedNoProgress:
        finalNoProgressWithReasonCode?.failedNoProgress || null,
      lastMeaningfulChange:
        lastMeaningfulProgressSnapshot &&
        typeof lastMeaningfulProgressSnapshot === 'object' ?
          {
            attempt: lastMeaningfulProgressAttempt,
            elapsedMs: lastMeaningfulProgressElapsedMs,
            message: formatActiveWaitProgressSnapshot(
              lastMeaningfulProgressSnapshot,
            ),
          } :
          null,
      lastProgressEvent:
        lastObservedProgressSnapshot &&
        typeof lastObservedProgressSnapshot === 'object' ?
          {
            attempt: lastObservedAttempt,
            elapsedMs: lastObservedElapsedMs,
            message: formatActiveWaitProgressSnapshot(
              lastObservedProgressSnapshot,
            ),
          } :
          null,
      blockerHistory: summarizeActiveWaitBlockerHistory(blockerHistoryBySignature),
      admissionState: summarizeAdmissionState(
        pollResult.lastResult?.nodeDiagnostics || [],
      ),
      waitPolicy: resolveActiveGateWaitPolicy(pollResult.lastResult),
    });
    this._recordClusterStage(CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE, {
      attempts: pollResult.attempts,
      elapsedMs: pollResult.elapsedMs,
      nodeDiagnostics: pollResult.lastResult?.nodeDiagnostics || [],
      snapshotCoverage: pollResult.lastResult?.snapshotCoverage || null,
      publicationConvergenceGate:
        pollResult.lastResult?.publicationConvergenceGate || null,
      priorityRecoveryInvariants:
        pollResult.lastResult?.priorityRecoveryInvariants || null,
      invariantBreaches: priorityRecoveryInvariantBreaches,
      activeGate: timeoutActiveGateDetails.activeGate,
      ...timeoutActiveGateDetails,
    });
    const timeoutError = new Error(
      'Not all nodes reached ' +
        ACTIVE_STATE +
        ' state within ' +
        timeout +
        'ms' +
        ' (attempts=' +
        pollResult.attempts +
        ', elapsedMs=' +
        pollResult.elapsedMs +
        ', nodeDiagnostics=' +
        (nodeDiagnosticsSummary || 'none') +
        ', snapshotCoverage=' +
        snapshotCoverageSummary +
        ', publicationConvergence=' +
        publicationConvergenceSummary +
        ', priorityRecoveryInvariants=' +
        (priorityRecoveryFailingInvariantIds.length > ZERO ?
          priorityRecoveryFailingInvariantIds.join('|') :
          'passed') +
        ', progress=' +
        formatActiveWaitProgressSnapshot(terminalProgressSnapshot) +
        (Number.isInteger(noProgressMaxAttempts) && noProgressMaxAttempts > ZERO ?
          ', attemptsSinceProgress=' +
            String(finalAttemptsSinceProgress) +
            '/' +
            String(noProgressMaxAttempts) :
          '') +
        ', inactiveSummary=' +
        (inactiveSummary || 'none') +
        ')',
    );
    const finalAdjudication = await runFinalAdjudication(Array.from(this._nodes.values()));
    timeoutError.diagnostics = {
      consistencyVerdict: finalAdjudication.verdict,
      finalAdjudication,
      activeGate: timeoutActiveGateDetails.activeGate,
      noProgress: finalNoProgressOwnerOutcome ?
        {
          ...finalNoProgressOwnerOutcome,
          readinessFailure: finalReadinessFailure,
          stalledReason:
              ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX +
              String(finalAttemptsSinceProgress),
          failedNoProgress: {
            phase: CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
            details: {
              mode: readinessMode,
              budgetCoordinatorCycles: noProgressMaxAttempts,
              budgetAttempts: noProgressMaxAttempts,
              attempts: pollResult.attempts,
              elapsedMs: pollResult.elapsedMs,
              attemptsSinceProgress: finalAttemptsSinceProgress,
              coordinatorCyclesSinceProgress: finalAttemptsSinceProgress,
              timedOut: true,
            },
          },
          lastMeaningfulChange:
              lastMeaningfulProgressSnapshot &&
              typeof lastMeaningfulProgressSnapshot === 'object' ?
                {
                  attempt: lastMeaningfulProgressAttempt,
                  elapsedMs: lastMeaningfulProgressElapsedMs,
                  message: formatActiveWaitProgressSnapshot(
                    lastMeaningfulProgressSnapshot,
                  ),
                } :
                null,
          lastProgressEvent:
              lastObservedProgressSnapshot &&
              typeof lastObservedProgressSnapshot === 'object' ?
                {
                  attempt: lastObservedAttempt,
                  elapsedMs: lastObservedElapsedMs,
                  message: formatActiveWaitProgressSnapshot(
                    lastObservedProgressSnapshot,
                  ),
                } :
                null,
          priorityRecoveryInvariants:
              pollResult.lastResult?.priorityRecoveryInvariants || null,
        } :
        null,
      invariantBreaches: priorityRecoveryInvariantBreaches,
      priorityRecoveryInvariants:
        pollResult.lastResult?.priorityRecoveryInvariants || null,
    };
    throw timeoutError;
  }

  async waitForLoadReadinessStability(options = {}) {
    const stableWindowMs = this._resolveLoadReadinessStableWindowMs(options);
    if (stableWindowMs <= ZERO) {
      return;
    }
    const timeoutMs = this._resolveLoadReadinessStabilityTimeoutMs(options);
    const deadline = Date.now() + timeoutMs;
    const loadReadinessPhase = normalizeLoadReadinessPhase(
      options.loadReadinessPhase,
    );
    const noProgressMaxAttempts =
      this._resolveActiveWaitNoProgressMaxAttempts(options, timeoutMs);
    let stableWindowStartedAt = LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP;
    let stableWindowStartedSource =
      LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE;
    let stableWindowResetAt = normalizeStableWindowTimestamp(Date.now());
    const instabilitySummaryCounts = new Map();
    const blockerHistoryBySignature = new Map();
    let bestProgressSnapshot = null;
    let bestProgressScore = Number.NEGATIVE_INFINITY;
    let bestSnapshotCoverageProgressSnapshot = null;
    let lastMeaningfulProgressAttempt = ZERO;
    let lastMeaningfulProgressElapsedMs = ZERO;
    let lastMeaningfulProgressSnapshot = null;
    let lastObservedProgressSnapshot = null;
    let lastObservedAttempt = ZERO;
    let lastObservedElapsedMs = ZERO;
    let highestStableElapsedMs = ZERO;

    const buildLoadReadinessNoProgressDetails = (
      attempts,
      elapsedMs,
      stalled,
      progressSnapshot,
    ) => {
      const noProgressBudgetEnabled =
        Number.isInteger(noProgressMaxAttempts) &&
        noProgressMaxAttempts > ZERO;
      const attemptsSinceProgress = Math.max(
        ZERO,
        attempts - (lastMeaningfulProgressAttempt || ZERO),
      );
      return {
        enabled: noProgressBudgetEnabled,
        mode: CLUSTER_READINESS_MODE_LOAD,
        loadReadinessPhase,
        maxAttempts: noProgressBudgetEnabled ? noProgressMaxAttempts : null,
        maxCoordinatorCycles: noProgressBudgetEnabled ?
          noProgressMaxAttempts :
          null,
        attemptsSinceProgress,
        coordinatorCyclesSinceProgress: attemptsSinceProgress,
        stalled: stalled === true,
        lastMeaningfulProgressAttempt: lastMeaningfulProgressAttempt || null,
        lastMeaningfulProgressElapsedMs:
          lastMeaningfulProgressElapsedMs || null,
        lastMeaningfulProgress: lastMeaningfulProgressSnapshot || null,
        currentProgress: progressSnapshot || null,
        closureRecordId: progressSnapshot?.closureRecordId || null,
        closureWitnessClass: progressSnapshot?.closureWitnessClass || null,
        readinessDelay: progressSnapshot?.readinessDelay || null,
      };
    };

    const buildLoadReadinessActiveGateDetails = ({
      state = PRIORITY_RECOVERY_ACTIVE_GATE_STATE.WAITING,
      attempts = ZERO,
      elapsedMs = ZERO,
      result = null,
      progressSnapshot = null,
      noProgress = null,
      readinessFailure = null,
      reasonCode = null,
      stalledReason = null,
      failedNoProgress = null,
      lastMeaningfulChange = null,
      lastProgressEvent = null,
      blockerHistory = [],
    } = {}) => {
      const resolvedProgressSnapshot =
        progressSnapshot ||
        buildActiveWaitProgressSnapshot(
          result || {},
          this._nodes.size,
          {readinessMode: CLUSTER_READINESS_MODE_LOAD},
        );
      const attemptsSinceProgress = Math.max(
        ZERO,
        attempts - (lastMeaningfulProgressAttempt || ZERO),
      );
      const maxAttempts =
        Number.isInteger(noProgress?.maxAttempts) &&
        noProgress.maxAttempts > ZERO ?
          Math.max(ZERO, noProgress.maxAttempts) :
          Number.isInteger(noProgressMaxAttempts) &&
              noProgressMaxAttempts > ZERO ?
            Math.max(ZERO, noProgressMaxAttempts) :
            null;
      const activeGate = buildPriorityRecoveryActiveGateSnapshot({
        mode: CLUSTER_READINESS_MODE_LOAD,
        state,
        attempts,
        elapsedMs,
        maxAttempts,
        maxCoordinatorCycles: maxAttempts,
        attemptsSinceProgress,
        coordinatorCyclesSinceProgress: attemptsSinceProgress,
        progress: resolvedProgressSnapshot,
        bestProgress: bestProgressSnapshot || resolvedProgressSnapshot,
        closureRecordId: resolvedProgressSnapshot?.closureRecordId || null,
        closureWitnessClass:
          resolvedProgressSnapshot?.closureWitnessClass || null,
        reasonCode,
        stalledReason,
        blockerHistory,
        readinessDelay:
          noProgress?.readinessDelay ||
          resolvedProgressSnapshot?.readinessDelay ||
          null,
        readinessFailure,
        lastMeaningfulProgress: lastMeaningfulProgressSnapshot || null,
        lastMeaningfulChange,
        lastProgressEvent,
        failedNoProgress,
        waitPolicy: buildActiveGateWaitPolicy({
          readinessMode: CLUSTER_READINESS_MODE_LOAD,
          closureRecordId: resolvedProgressSnapshot?.closureRecordId || null,
        }),
        stalled: state === PRIORITY_RECOVERY_ACTIVE_GATE_STATE.STALLED,
        timedOut: state === PRIORITY_RECOVERY_ACTIVE_GATE_STATE.TIMED_OUT,
      });
      return {
        activeGate,
        ...derivePriorityRecoveryActiveGateReportFields(activeGate),
      };
    };

    const observeLoadReadinessProgress = (attempts, elapsedMs, result) => {
      const progressSnapshot = buildActiveWaitProgressSnapshot(
        result || {},
        this._nodes.size,
        {readinessMode: CLUSTER_READINESS_MODE_LOAD},
      );
      const stableElapsedMs = Number.isFinite(result?.stableElapsedMs) ?
        Math.max(ZERO, Math.floor(result.stableElapsedMs)) :
        ZERO;
      const progressScore = scoreActiveWaitProgress(progressSnapshot);
      const activeGateProgressObserved = progressScore > bestProgressScore;
      const stableWindowProgressObserved =
        result?.loadReadinessStableWindow?.state ===
          LOAD_READINESS_STABLE_WINDOW_STATE_PENDING &&
        stableElapsedMs > highestStableElapsedMs;
      if (activeGateProgressObserved) {
        bestProgressScore = progressScore;
        bestProgressSnapshot = progressSnapshot;
      }
      if (
        isBetterActiveWaitSnapshotCoverageProgressSnapshot(
          progressSnapshot,
          bestSnapshotCoverageProgressSnapshot,
        )
      ) {
        bestSnapshotCoverageProgressSnapshot = progressSnapshot;
      }
      if (stableWindowProgressObserved) {
        highestStableElapsedMs = stableElapsedMs;
      }
      if (activeGateProgressObserved || stableWindowProgressObserved) {
        lastMeaningfulProgressAttempt = attempts;
        lastMeaningfulProgressElapsedMs = elapsedMs;
        lastMeaningfulProgressSnapshot = progressSnapshot;
      }
      upsertActiveWaitBlockerHistory(
        blockerHistoryBySignature,
        progressSnapshot,
        attempts,
        elapsedMs,
      );
      lastObservedProgressSnapshot = progressSnapshot;
      lastObservedAttempt = attempts;
      lastObservedElapsedMs = elapsedMs;
      return {
        progressSnapshot,
        attemptsSinceProgress: Math.max(
          ZERO,
          attempts - (lastMeaningfulProgressAttempt || ZERO),
        ),
        blockerHistory: summarizeActiveWaitBlockerHistory(
          blockerHistoryBySignature,
        ),
      };
    };
    this._recordClusterStage(CLUSTER_STAGE_LOAD_READINESS_WAITING, {
      loadReadinessPhase,
      stableWindowMs,
      timeoutMs,
    });
    let pollResult;
    try {
      pollResult = await pollUntilCondition({
        deadline,
        intervalMs: ACTIVE_POLL_INTERVAL_MS,
        sleep: (ms) => this._sleep(ms),
        probe: async () => {
          const activeProbe = await this._probeClusterActiveState(deadline, {
            mode: CLUSTER_READINESS_MODE_LOAD,
          });
          const now = Date.now();
          if (activeProbe.allActive !== true) {
            stableWindowStartedAt = LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP;
            stableWindowStartedSource =
              LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE;
            stableWindowResetAt = normalizeStableWindowTimestamp(now);
          }
          const stableWindow = decideLoadReadinessStableWindow({
            activeProbe,
            stableWindowMs,
            currentStartedAt: stableWindowStartedAt,
            currentSource: stableWindowStartedSource,
            resetAt: stableWindowResetAt,
            nowMs: now,
          });
          if (activeProbe.allActive === true) {
            stableWindowStartedAt = stableWindow.startedAt;
            stableWindowStartedSource = stableWindow.source;
          }
          return {
            ...activeProbe,
            stableElapsedMs: stableWindow.stableElapsedMs,
            loadReadinessStableWindow: stableWindow,
            stable: stableWindow.stable,
          };
        },
        isSuccess: (result) => result.stable === true,
        onAttempt: ({attempts, elapsedMs, lastResult}) => {
        const readinessProgress = observeLoadReadinessProgress(
          attempts,
          elapsedMs,
          lastResult,
        );
        const noProgress = buildLoadReadinessNoProgressDetails(
          attempts,
          elapsedMs,
          false,
          readinessProgress.progressSnapshot,
        );
        for (const diagnostic of lastResult.nodeDiagnostics || []) {
          if (diagnostic.active === true) {
            continue;
          }
          const summaryKey = diagnostic.error ?
            'error:' + diagnostic.error :
            'state:' + (diagnostic.state || UNKNOWN_STATE);
          instabilitySummaryCounts.set(
            summaryKey,
            (instabilitySummaryCounts.get(summaryKey) || ZERO) + 1,
          );
        }
        this._recordPeriodicStartupWaitingStage(
          CLUSTER_STAGE_LOAD_READINESS_WAITING,
          {
            attempts,
            elapsedMs,
          },
          {
            loadReadinessPhase,
            stableWindowMs,
            stableElapsedMs: lastResult?.stableElapsedMs ?? ZERO,
            loadReadinessStableWindow:
              lastResult.loadReadinessStableWindow || null,
            nodeDiagnostics: lastResult.nodeDiagnostics || [],
            snapshotCoverage: lastResult.snapshotCoverage || null,
            publicationConvergenceGate:
              lastResult.publicationConvergenceGate || null,
            priorityRecoveryInvariants:
              lastResult.priorityRecoveryInvariants || null,
            ...buildLoadReadinessActiveGateDetails({
              attempts,
              elapsedMs,
              result: lastResult,
              progressSnapshot: readinessProgress.progressSnapshot,
              noProgress,
              blockerHistory: readinessProgress.blockerHistory,
            }),
          },
        );
        if (
          Number.isInteger(noProgressMaxAttempts) &&
          noProgressMaxAttempts > ZERO &&
          readinessProgress.attemptsSinceProgress >= noProgressMaxAttempts
        ) {
          const stalledAttempts = readinessProgress.attemptsSinceProgress;
          const stalledProgressSnapshot =
            selectTerminalActiveWaitProgressSnapshot({
              currentProgressSnapshot: readinessProgress.progressSnapshot,
              lastMeaningfulProgressSnapshot,
              bestSnapshotCoverageProgressSnapshot,
            });
          const stalledProgress = buildLoadReadinessNoProgressDetails(
            attempts,
            elapsedMs,
            true,
            stalledProgressSnapshot,
          );
          const stalledNoProgress = {
            ...stalledProgress,
            readinessFailure: buildActiveWaitReadinessFailure({
              mode: CLUSTER_READINESS_MODE_LOAD,
              noProgress: stalledProgress,
              attemptsSinceProgress: stalledAttempts,
              maxAttempts: noProgressMaxAttempts,
            }),
            reasonCode: ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
            stalledReason:
              ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX +
              String(stalledAttempts),
            failedNoProgress: {
              phase: CLUSTER_STAGE_LOAD_READINESS_WAITING,
              details: {
                mode: CLUSTER_READINESS_MODE_LOAD,
                loadReadinessPhase,
                budgetCoordinatorCycles: noProgressMaxAttempts,
                budgetAttempts: noProgressMaxAttempts,
                attempts,
                elapsedMs,
                attemptsSinceProgress: stalledAttempts,
                coordinatorCyclesSinceProgress: stalledAttempts,
              },
            },
            lastMeaningfulChange:
              lastMeaningfulProgressSnapshot &&
              typeof lastMeaningfulProgressSnapshot === 'object' ?
                {
                  attempt: lastMeaningfulProgressAttempt,
                  elapsedMs: lastMeaningfulProgressElapsedMs,
                  message: formatActiveWaitProgressSnapshot(
                    lastMeaningfulProgressSnapshot,
                  ),
                } :
                null,
            lastProgressEvent:
              readinessProgress.progressSnapshot &&
              typeof readinessProgress.progressSnapshot === 'object' ?
                {
                  attempt: attempts,
                  elapsedMs,
                  message: formatActiveWaitProgressSnapshot(
                    readinessProgress.progressSnapshot,
                  ),
                } :
                null,
          };
          const stalledActiveGateDetails = buildLoadReadinessActiveGateDetails({
            state: PRIORITY_RECOVERY_ACTIVE_GATE_STATE.STALLED,
            attempts,
            elapsedMs,
            result: lastResult,
            progressSnapshot: stalledProgressSnapshot,
            noProgress: stalledNoProgress,
            readinessFailure: stalledNoProgress.readinessFailure,
            reasonCode: stalledNoProgress.reasonCode,
            stalledReason: stalledNoProgress.stalledReason,
            failedNoProgress: stalledNoProgress.failedNoProgress,
            lastMeaningfulChange: stalledNoProgress.lastMeaningfulChange,
            lastProgressEvent: stalledNoProgress.lastProgressEvent,
            blockerHistory: readinessProgress.blockerHistory,
          });
          this._recordClusterStage(CLUSTER_STAGE_LOAD_READINESS_WAITING, {
            loadReadinessPhase,
            attempts,
            elapsedMs,
            stableWindowMs,
            stableElapsedMs: lastResult?.stableElapsedMs ?? ZERO,
            loadReadinessStableWindow:
              lastResult.loadReadinessStableWindow || null,
            nodeDiagnostics: lastResult.nodeDiagnostics || [],
            snapshotCoverage: lastResult.snapshotCoverage || null,
            publicationConvergenceGate:
              lastResult.publicationConvergenceGate || null,
            priorityRecoveryInvariants:
              lastResult.priorityRecoveryInvariants || null,
            ...stalledActiveGateDetails,
          });
          const stalledError = new Error(
            ACTIVE_WAIT_STALLED_MESSAGE_PREFIX +
              'for ' +
              String(stalledAttempts) +
              ' attempts (mode=' +
              CLUSTER_READINESS_MODE_LOAD +
              ', progress=' +
              formatActiveWaitProgressSnapshot(
                stalledProgressSnapshot,
              ) +
              ')',
          );
          stalledError.diagnostics = {
            activeGate: stalledActiveGateDetails.activeGate,
            noProgress: stalledNoProgress,
            priorityRecoveryInvariants:
              lastResult?.priorityRecoveryInvariants || null,
          };
          throw stalledError;
        }
        },
      });
    } catch (error) {
      try {
        await this._collectFailureLogs();
      } catch (_collectFailureLogsError) {
        // Best effort log collection only.
      }
      throw error;
    }

    if (pollResult.success) {
      this._recordClusterStage(CLUSTER_STAGE_LOAD_READINESS_STABLE, {
        stableWindowMs,
        timeoutMs,
        loadReadinessPhase,
        attempts: pollResult.attempts,
        elapsedMs: pollResult.elapsedMs,
        stableElapsedMs: pollResult.lastResult?.stableElapsedMs ?? ZERO,
        loadReadinessStableWindow:
          pollResult.lastResult?.loadReadinessStableWindow || null,
        snapshotCoverage: pollResult.lastResult?.snapshotCoverage || null,
        publicationConvergenceGate:
          pollResult.lastResult?.publicationConvergenceGate || null,
      });
      return;
    }

    await this._collectFailureLogs();
    const nodeDiagnosticsSummary = formatNodeDiagnostics(
      pollResult.lastResult?.nodeDiagnostics || [],
    );
    const instabilitySummary = formatCountSummary(instabilitySummaryCounts);
    const snapshotCoverageSummary = formatSnapshotCoverage(
      pollResult.lastResult?.snapshotCoverage || null,
    );
    const publicationConvergenceSummary = formatPublicationConvergenceGate(
      pollResult.lastResult?.publicationConvergenceGate || null,
      pollResult.lastResult,
    );
    const finalProgressSnapshot =
      lastObservedProgressSnapshot ||
      buildActiveWaitProgressSnapshot(
        pollResult.lastResult || {},
        this._nodes.size,
        {readinessMode: CLUSTER_READINESS_MODE_LOAD},
      );
    const terminalProgressSnapshot = selectTerminalActiveWaitProgressSnapshot({
      currentProgressSnapshot: finalProgressSnapshot,
      lastMeaningfulProgressSnapshot,
      bestSnapshotCoverageProgressSnapshot,
    });
    const finalAttemptsSinceProgress = Math.max(
      ZERO,
      pollResult.attempts - (lastMeaningfulProgressAttempt || ZERO),
    );
    const finalNoProgress = buildLoadReadinessNoProgressDetails(
      pollResult.attempts,
      pollResult.elapsedMs,
      false,
      terminalProgressSnapshot,
    );
    const finalNoProgressWithReasonCode = {
      ...finalNoProgress,
      reasonCode: ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
      stalledReason:
        ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX +
        String(finalAttemptsSinceProgress),
    };
    const finalReadinessFailure = buildActiveWaitReadinessFailure({
      mode: CLUSTER_READINESS_MODE_LOAD,
      noProgress: finalNoProgressWithReasonCode,
      attemptsSinceProgress: finalAttemptsSinceProgress,
      maxAttempts: noProgressMaxAttempts,
    });
    const timeoutActiveGateDetails = buildLoadReadinessActiveGateDetails({
      state: PRIORITY_RECOVERY_ACTIVE_GATE_STATE.TIMED_OUT,
      attempts: pollResult.attempts,
      elapsedMs: pollResult.elapsedMs,
      result: pollResult.lastResult,
      progressSnapshot: terminalProgressSnapshot,
      noProgress: finalNoProgressWithReasonCode,
      readinessFailure: finalReadinessFailure,
      reasonCode: ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
      stalledReason:
        ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX +
        String(finalAttemptsSinceProgress),
      blockerHistory: summarizeActiveWaitBlockerHistory(
        blockerHistoryBySignature,
      ),
    });
    const stableWindowFailure = buildLoadReadinessStableWindowFailure(
      pollResult.lastResult?.loadReadinessStableWindow,
    );
    this._recordClusterStage(CLUSTER_STAGE_LOAD_READINESS_WAITING, {
      stableWindowMs,
      timeoutMs,
      loadReadinessPhase,
      attempts: pollResult.attempts,
      elapsedMs: pollResult.elapsedMs,
      stableElapsedMs: pollResult.lastResult?.stableElapsedMs ?? ZERO,
      loadReadinessStableWindow:
        pollResult.lastResult?.loadReadinessStableWindow || null,
      nodeDiagnostics: pollResult.lastResult?.nodeDiagnostics || [],
      snapshotCoverage: pollResult.lastResult?.snapshotCoverage || null,
      publicationConvergenceGate:
        pollResult.lastResult?.publicationConvergenceGate || null,
      priorityRecoveryInvariants:
        pollResult.lastResult?.priorityRecoveryInvariants || null,
      activeGate: timeoutActiveGateDetails.activeGate,
      ...timeoutActiveGateDetails,
    });
    const timeoutError = new Error(
      'Cluster load readiness did not stabilize within ' +
        timeoutMs +
        'ms (attempts=' +
        pollResult.attempts +
        ', elapsedMs=' +
        pollResult.elapsedMs +
        ', stableWindowMs=' +
        stableWindowMs +
        ', stableElapsedMs=' +
        (pollResult.lastResult?.stableElapsedMs ?? ZERO) +
        ', nodeDiagnostics=' +
        (nodeDiagnosticsSummary || 'none') +
        ', snapshotCoverage=' +
        snapshotCoverageSummary +
        ', publicationConvergence=' +
        publicationConvergenceSummary +
        ', instabilitySummary=' +
        (instabilitySummary || 'none') +
        ')',
    );
    const finalAdjudication = await runFinalAdjudication(Array.from(this._nodes.values()));
    timeoutError.diagnostics = {
      consistencyVerdict: finalAdjudication.verdict,
      finalAdjudication,
      activeGate: timeoutActiveGateDetails.activeGate,
      loadReadinessPhase,
      ...(stableWindowFailure ? {failure: stableWindowFailure} : {}),
      loadReadinessStableWindow:
        pollResult.lastResult?.loadReadinessStableWindow || null,
      controlPlaneDiagnostics: {
        publicationConvergenceGate:
          pollResult.lastResult?.publicationConvergenceGate || null,
        activeGateSnapshotCoverage:
          pollResult.lastResult?.snapshotCoverage || null,
        priorityRecoveryInvariants:
          pollResult.lastResult?.priorityRecoveryInvariants || null,
        loadReadinessStableWindow:
          pollResult.lastResult?.loadReadinessStableWindow || null,
        activeGate: timeoutActiveGateDetails.activeGate,
        ...timeoutActiveGateDetails,
      },
      noProgress: {
        ...finalNoProgressWithReasonCode,
        readinessFailure: finalReadinessFailure,
        loadReadinessPhase,
      },
      nodeDiagnostics: pollResult.lastResult?.nodeDiagnostics || [],
      snapshotCoverage: pollResult.lastResult?.snapshotCoverage || null,
      priorityRecoveryInvariants:
        pollResult.lastResult?.priorityRecoveryInvariants || null,
    };
    throw timeoutError;
  }

  _extractNodeState(status) {
    if (!status) {
      return null;
    }
    if (Array.isArray(status.rows) && status.rows.length > 0) {
      const row = status.rows[0];
      if (typeof row.status === 'string' && row.status.length > 0) {
        return row.status.toLowerCase();
      }
      if (typeof row.state === 'string' && row.state.length > 0) {
        return row.state.toLowerCase();
      }
    }
    if (typeof status.status === 'string' && status.status.length > 0) {
      return status.status.toLowerCase();
    }
    if (typeof status.state === 'string' && status.state.length > 0) {
      return status.state.toLowerCase();
    }
    return null;
  }

  _isNodeActive(status) {
    if (!status) return false;
    if (status.rows && status.rows.length > 0) {
      return (
        this._isActiveValue(status.rows[0].status) ||
        this._isActiveValue(status.rows[0].state)
      );
    }
    if (this._isActiveValue(status.status)) return true;
    if (this._isActiveValue(status.state)) return true;
    return false;
  }

  _isActiveValue(value) {
    if (typeof value !== 'string') {
      return false;
    }
    return value.toLowerCase() === STATUS_ACTIVE_LOWER;
  }

  async _collectFailureLogs() {
    for (const node of this._nodes.values()) {
      try {
        const logs = await withTimeout(
          node.getLogs({tail: CONTAINER_LOG_TAIL_LINES}),
          LOG_COLLECTION_TIMEOUT_MS,
          'Timed out collecting logs for node ' + node.id,
        );
        process.stderr.write(
          '--- Logs from ' +
            node.id +
            ' (' +
            node.role +
            ') ---\n' +
            logs +
            '\n',
        );
      } catch (_err) {
        // Best-effort log collection
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const CLUSTER_SEGMENT_7 = {
  ...CLUSTER_SEGMENT_6,
  Cluster,
};
