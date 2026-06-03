import {ASSERTIONS_SEGMENT_2} from './assertions-segment-2.js';
import {
  buildPriorityRecoveryActiveGateSnapshot,
  derivePriorityRecoveryActiveGateReportFields,
  PRIORITY_RECOVERY_ACTIVE_GATE_STATE,
} from './active-gate-contract.js';
import {CLUSTER_SEGMENT_6} from './cluster-segment-6.js';
import {
  LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
  LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE,
  LOAD_READINESS_STABLE_WINDOW_STATE_PENDING,
  buildActiveWaitReadinessFailure,
  buildLoadReadinessStableWindowFailure,
  decideLoadReadinessStableWindow,
  isBetterActiveWaitSnapshotCoverageProgressSnapshot,
  normalizeLoadReadinessPhase,
  normalizeStableWindowTimestamp,
  selectLoadActiveGateSnapshotRepairContinuation,
  selectTerminalActiveWaitProgressSnapshot,
} from './cluster-segment-7-alpha-active-wait.js';

const {runFinalAdjudication} = ASSERTIONS_SEGMENT_2;
const {
  ACTIVE_POLL_INTERVAL_MS,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX,
  ACTIVE_WAIT_STALLED_MESSAGE_PREFIX,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_STAGE_LOAD_READINESS_STABLE,
  CLUSTER_STAGE_LOAD_READINESS_WAITING,
  TIMEOUTS,
  UNKNOWN_STATE,
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
  upsertActiveWaitBlockerHistory,
} = CLUSTER_SEGMENT_6;

const LOAD_READINESS_ADMISSION_GATE_STATE_READY = 'ready';
const LOAD_READINESS_ADMISSION_GATE_STATE_BLOCKED = 'blocked';
const LOAD_READINESS_ADMISSION_GATE_REASON_READY = 'ready';
const LOAD_READINESS_ADMISSION_GATE_REASON_INACTIVE = 'inactive';
const LOAD_READINESS_ADMISSION_GATE_REASON_OWNER_RECOVERY_PENDING =
  'active_gate_owner_recovery_pending';
const LOAD_READINESS_ACTIVE_GATE_COHORT_STATE_COMPLETE = 'complete';
const LOAD_READINESS_ACTIVE_GATE_COHORT_STATE_PENDING = 'pending';
const LOAD_READINESS_ACTIVE_GATE_COHORT_NEXT_ACTION_ADMIT =
  'admit_active_gate';
const LOAD_READINESS_ACTIVE_GATE_COHORT_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const LOAD_READINESS_ACTIVE_GATE_OWNER_RECOVERY_REASON =
  'owner_reconcile_pending';
const LOAD_READINESS_ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_DEFERRED =
  'write_deferred';
const ZERO_COUNT = 0;

function normalizeNonNegativeCount(value) {
  return Number.isInteger(value) && value >= ZERO_COUNT ? value : ZERO_COUNT;
}

function normalizePositiveDurationMs(value) {
  return Number.isFinite(value) && value > ZERO_COUNT ?
    Math.floor(value) :
    ZERO_COUNT;
}

function resolveLoadReadinessAdmissionExpectedNodeCount(activeProbe) {
  const snapshotExpectedCount = activeProbe?.snapshotCoverage?.expectedNodeCount;
  if (
    Number.isInteger(snapshotExpectedCount) &&
    snapshotExpectedCount > ZERO_COUNT
  ) {
    return snapshotExpectedCount;
  }
  return Array.isArray(activeProbe?.nodeDiagnostics) ?
    activeProbe.nodeDiagnostics.length :
    ZERO_COUNT;
}

function buildLoadReadinessAdmissionProgressSnapshot(activeProbe) {
  return buildActiveWaitProgressSnapshot(
    activeProbe || {},
    resolveLoadReadinessAdmissionExpectedNodeCount(activeProbe),
    {readinessMode: CLUSTER_READINESS_MODE_LOAD},
  );
}

function hasSatisfiedLoadReadinessPriorityRecovery(progressSnapshot) {
  return (
    normalizeNonNegativeCount(
      progressSnapshot?.priorityRecoveryUnresolvedClassCount,
    ) === ZERO_COUNT &&
    normalizeNonNegativeCount(
      progressSnapshot?.priorityRecoveryUnresolvedSemanticStateCount,
    ) === ZERO_COUNT &&
    normalizeNonNegativeCount(
      progressSnapshot?.priorityRecoveryBlockedPartitionCount,
    ) === ZERO_COUNT &&
    progressSnapshot?.prioritySpreadSatisfied !== false
  );
}

function hasBoundedLoadReadinessOwnerRecoveryHandoff(progressSnapshot) {
  const queueDepth = progressSnapshot?.selectedControlPlaneOwnerQueueDepth;
  if (
    progressSnapshot?.activeGateOwnerCohortState ===
    LOAD_READINESS_ACTIVE_GATE_COHORT_STATE_COMPLETE
  ) {
    return false;
  }
  const pendingRecoveryCount = normalizeNonNegativeCount(
    progressSnapshot?.activeGateOwnerCohortPendingRecoveryCount,
  );
  const pendingRecoveryNodeIds = normalizeDistinctStringArray(
    progressSnapshot?.activeGateOwnerCohortPendingRecoveryNodeIds,
  );
  const pendingWrites = normalizeNonNegativeCount(queueDepth?.pendingWrites);
  return (
    progressSnapshot?.activeGateOwnerCohortState ===
      LOAD_READINESS_ACTIVE_GATE_COHORT_STATE_PENDING &&
    progressSnapshot?.publicationActiveGateHandoffReasonCode ===
      LOAD_READINESS_ACTIVE_GATE_OWNER_RECOVERY_REASON &&
    progressSnapshot?.publicationActiveGateHandoffNextAction ===
      LOAD_READINESS_ACTIVE_GATE_COHORT_NEXT_ACTION_WAIT_OWNER_RECOVERY &&
    progressSnapshot?.publicationActiveGateHandoffRuntimePromotionAllowed !==
      true &&
    pendingRecoveryCount > ZERO_COUNT &&
    pendingRecoveryNodeIds.length > ZERO_COUNT &&
    pendingWrites >= Math.max(
      pendingRecoveryCount,
      pendingRecoveryNodeIds.length,
    ) &&
    normalizeNonNegativeCount(
      progressSnapshot?.activeGateOwnerCohortPendingReconcileCount,
    ) === ZERO_COUNT &&
    normalizeNonNegativeCount(queueDepth?.pendingWriteGrowthCount) ===
      ZERO_COUNT &&
    progressSnapshot?.membershipPublicationHandoffOutcomeState ===
      LOAD_READINESS_ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_DEFERRED &&
    progressSnapshot?.membershipPublicationHandoffOutcomeReasonCode ===
      LOAD_READINESS_ACTIVE_GATE_OWNER_RECOVERY_REASON &&
    progressSnapshot?.membershipPublicationHandoffOutcomeEnqueued === true &&
    normalizePositiveDurationMs(
      progressSnapshot?.membershipPublicationHandoffOutcomeRetryAfterMs,
    ) > ZERO_COUNT
  );
}

function hasLoadReadinessStartupSupportOwnerRecoveryWindow(progressSnapshot) {
  const expectedNodeCount = normalizeNonNegativeCount(
    progressSnapshot?.expectedNodeCount,
  );
  return (
    expectedNodeCount > ZERO_COUNT &&
    normalizeNonNegativeCount(progressSnapshot?.activeNodeCount) >=
      expectedNodeCount &&
    normalizeNonNegativeCount(progressSnapshot?.inactiveNodeCount) ===
      ZERO_COUNT &&
    progressSnapshot?.snapshotCoverageComplete === true &&
    normalizeNonNegativeCount(progressSnapshot?.selectedPublishedActiveCount) >=
      expectedNodeCount &&
    normalizeNonNegativeCount(progressSnapshot?.missingPublishedCount) ===
      ZERO_COUNT &&
    normalizeNonNegativeCount(progressSnapshot?.pendingAckCount) ===
      ZERO_COUNT &&
    hasSatisfiedLoadReadinessPriorityRecovery(progressSnapshot) === true &&
    hasBoundedLoadReadinessOwnerRecoveryHandoff(progressSnapshot) === true
  );
}

function evaluateActiveGateOwnerCohortPromotion(activeProbe) {
  const cohort = resolveActiveGateOwnerCohort(activeProbe);
  if (!cohort) {
    return {
      promotionReady: activeProbe?.snapshotCoverage?.completeCoverage === true,
      startupSupportOwnerRecoveryWindow: false,
    };
  }
  const catchupFence =
    cohort.activeGateCatchupFence &&
    typeof cohort.activeGateCatchupFence === 'object' ?
      cohort.activeGateCatchupFence :
      null;
  if (
    cohort.runtimePromotionAllowed === true ||
    catchupFence?.promotionAllowed === true
  ) {
    return {
      promotionReady: true,
      startupSupportOwnerRecoveryWindow: false,
    };
  }
  if (
    cohort.state === LOAD_READINESS_ACTIVE_GATE_COHORT_STATE_COMPLETE &&
    cohort.nextAction === LOAD_READINESS_ACTIVE_GATE_COHORT_NEXT_ACTION_ADMIT
  ) {
    return {
      promotionReady: true,
      startupSupportOwnerRecoveryWindow: false,
    };
  }
  const progressSnapshot =
    buildLoadReadinessAdmissionProgressSnapshot(activeProbe);
  const startupSupportOwnerRecoveryWindow =
    hasLoadReadinessStartupSupportOwnerRecoveryWindow(progressSnapshot);
  return {
    promotionReady: startupSupportOwnerRecoveryWindow === true,
    startupSupportOwnerRecoveryWindow,
  };
}

function resolveActiveGateOwnerCohort(activeProbe) {
  const snapshotCoverage =
    activeProbe?.snapshotCoverage &&
    typeof activeProbe.snapshotCoverage === 'object' ?
      activeProbe.snapshotCoverage :
      null;
  const publicationHandoff =
    snapshotCoverage?.selectedPublicationActiveGateHandoff &&
    typeof snapshotCoverage.selectedPublicationActiveGateHandoff === 'object' ?
      snapshotCoverage.selectedPublicationActiveGateHandoff :
      null;
  if (publicationHandoff) {
    return publicationHandoff;
  }
  return snapshotCoverage?.selectedActiveGateOwnerCohort &&
    typeof snapshotCoverage.selectedActiveGateOwnerCohort === 'object' ?
    snapshotCoverage.selectedActiveGateOwnerCohort :
    null;
}

function buildLoadReadinessAdmissionGate(activeProbe, options = {}) {
  if (options.requireActiveGatePromotion !== true) {
    return null;
  }
  const cohort = resolveActiveGateOwnerCohort(activeProbe);
  const promotion = evaluateActiveGateOwnerCohortPromotion(activeProbe);
  const promotionReady = promotion.promotionReady;
  const pendingRecoveryCount = normalizeNonNegativeCount(
    cohort?.pendingRecoveryCount,
  );
  const pendingReconcileCount = normalizeNonNegativeCount(
    cohort?.pendingReconcileCount,
  );
  const blockedByOwnerRecovery =
    cohort?.nextAction ===
      LOAD_READINESS_ACTIVE_GATE_COHORT_NEXT_ACTION_WAIT_OWNER_RECOVERY ||
    pendingRecoveryCount > ZERO_COUNT ||
    pendingReconcileCount > ZERO_COUNT;
  return {
    required: true,
    state: promotionReady ?
      LOAD_READINESS_ADMISSION_GATE_STATE_READY :
      LOAD_READINESS_ADMISSION_GATE_STATE_BLOCKED,
    reasonCode: promotionReady ?
      LOAD_READINESS_ADMISSION_GATE_REASON_READY :
      blockedByOwnerRecovery ?
        LOAD_READINESS_ADMISSION_GATE_REASON_OWNER_RECOVERY_PENDING :
        LOAD_READINESS_ADMISSION_GATE_REASON_INACTIVE,
    promotionAllowed: promotionReady,
    ownerState: typeof cohort?.state === 'string' ? cohort.state : null,
    ownerReasonCode:
      typeof cohort?.reasonCode === 'string' ? cohort.reasonCode : null,
    ownerNextAction:
      typeof cohort?.nextAction === 'string' ? cohort.nextAction : null,
    pendingRecoveryCount,
    pendingReconcileCount,
    snapshotCoverageComplete:
      activeProbe?.snapshotCoverage?.completeCoverage === true,
    startupSupportOwnerRecoveryWindow:
      promotion.startupSupportOwnerRecoveryWindow === true,
  };
}

function applyLoadReadinessAdmissionGate(activeProbe, admissionGate) {
  if (!admissionGate || admissionGate.promotionAllowed === true) {
    const snapshotCoverage =
      admissionGate?.startupSupportOwnerRecoveryWindow === true &&
      activeProbe?.snapshotCoverage &&
      typeof activeProbe.snapshotCoverage === 'object' ?
        {
          ...activeProbe.snapshotCoverage,
          completeCoverage: true,
          canonicalCompleteCoverage:
            activeProbe.snapshotCoverage.completeCoverage === true,
          completeCoverageSource:
            'load_readiness_startup_support_owner_recovery_window',
        } :
        activeProbe?.snapshotCoverage;
    return {
      ...activeProbe,
      snapshotCoverage,
      loadReadinessAdmissionGate: admissionGate,
    };
  }
  return {
    ...activeProbe,
    allActive: false,
    loadReadinessAdmissionGate: admissionGate,
  };
}

export async function waitForLoadReadinessStability(options = {}) {
  const stableWindowMs = this._resolveLoadReadinessStableWindowMs(options);
  if (stableWindowMs <= ZERO) {
    return;
  }
  const timeoutMs = this._resolveLoadReadinessStabilityTimeoutMs(options);
  const deadline = Date.now() + timeoutMs;
  const forceRepairAfterMs = Number.isFinite(
    this._config?.timeouts?.activeWaitForceRepairAfter,
  ) ?
    Math.max(ZERO, this._config.timeouts.activeWaitForceRepairAfter) :
    TIMEOUTS.ACTIVE_WAIT_FORCE_REPAIR_AFTER;
  const forceRepairThreshold = Date.now() + forceRepairAfterMs;
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
  let highestStableElapsedMs = ZERO;
  let loadSnapshotRepairContinuationUsed = false;

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

  const selectLoadReadinessTerminalProgressSnapshot = (lastResult) => {
    const observedProgressSnapshot =
      lastObservedProgressSnapshot ||
      buildActiveWaitProgressSnapshot(
        lastResult || {},
        this._nodes.size,
        {readinessMode: CLUSTER_READINESS_MODE_LOAD},
      );
    return selectTerminalActiveWaitProgressSnapshot({
      currentProgressSnapshot: observedProgressSnapshot,
      lastMeaningfulProgressSnapshot,
      bestSnapshotCoverageProgressSnapshot,
    });
  };

  const extendLoadReadinessSnapshotRepairDeadline = ({lastResult}) => {
    if (loadSnapshotRepairContinuationUsed === true) {
      return null;
    }
    const progressSnapshot =
      selectLoadReadinessTerminalProgressSnapshot(lastResult);
    const continuation =
      selectLoadActiveGateSnapshotRepairContinuation({
        readinessMode: CLUSTER_READINESS_MODE_LOAD,
        progressSnapshot,
        pollIntervalMs: ACTIVE_POLL_INTERVAL_MS,
      });
    if (continuation.continuePolling !== true) {
      return null;
    }
    loadSnapshotRepairContinuationUsed = true;
    return {
      deadline: Date.now() + continuation.extendMs,
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
      probe: async ({deadline: currentDeadline = deadline} = {}) => {
        const forceRepair = Date.now() >= forceRepairThreshold;
        const activeProbeRaw = await this._probeClusterActiveState(
          currentDeadline,
          {
            mode: CLUSTER_READINESS_MODE_LOAD,
            forceRepair,
          },
        );
        const loadReadinessAdmissionGate = buildLoadReadinessAdmissionGate(
          activeProbeRaw,
          options,
        );
        const activeProbe = applyLoadReadinessAdmissionGate(
          activeProbeRaw,
          loadReadinessAdmissionGate,
        );
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
      extendDeadline: extendLoadReadinessSnapshotRepairDeadline,
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
            loadReadinessAdmissionGate:
            lastResult.loadReadinessAdmissionGate || null,
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
            loadReadinessAdmissionGate:
            lastResult.loadReadinessAdmissionGate || null,
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
      loadReadinessAdmissionGate:
        pollResult.lastResult?.loadReadinessAdmissionGate || null,
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
  const terminalProgressSnapshot =
    selectLoadReadinessTerminalProgressSnapshot(pollResult.lastResult);
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
    loadReadinessAdmissionGate:
      pollResult.lastResult?.loadReadinessAdmissionGate || null,
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
    loadReadinessAdmissionGate:
        pollResult.lastResult?.loadReadinessAdmissionGate || null,
    controlPlaneDiagnostics: {
      publicationConvergenceGate:
          pollResult.lastResult?.publicationConvergenceGate || null,
      activeGateSnapshotCoverage:
        pollResult.lastResult?.snapshotCoverage || null,
      priorityRecoveryInvariants:
        pollResult.lastResult?.priorityRecoveryInvariants || null,
      loadReadinessStableWindow:
        pollResult.lastResult?.loadReadinessStableWindow || null,
      loadReadinessAdmissionGate:
        pollResult.lastResult?.loadReadinessAdmissionGate || null,
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
