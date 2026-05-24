import {CLUSTER_SEGMENT_6} from './cluster-segment-6.js';
import {
  LIFECYCLE_REASON,
} from '../../../src/bootstrap/lifecycle-controller-constants.js';

const {
  ACTIVE_WAIT_NO_PROGRESS_CLASS_CODE,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
  ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  ONE,
  ZERO,
  normalizeDistinctStringArray,
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
  selectTerminalActiveWaitProgressSnapshot,
};
