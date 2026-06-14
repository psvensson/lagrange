import {CLUSTER_STARTUP_GATE_LAYER} from './cluster-startup-gate-layer.js';
import {ClusterControlSnapshotRecovery} from './cluster-class-control-snapshot-recovery.js';
import {ASSERTIONS_CONVERGENCE_WAIT} from './assertions-convergence-wait.js';
import {
  buildPriorityRecoveryActiveGateSnapshot,
  derivePriorityRecoveryActiveGateReportFields,
  PRIORITY_RECOVERY_ACTIVE_GATE_STATE,
} from './active-gate-contract.js';

const {runFinalAdjudication} = ASSERTIONS_CONVERGENCE_WAIT;

const {
  ACTIVE_POLL_INTERVAL_MS,
  ACTIVE_STATE,
  ACTIVE_WAIT_INACTIVE_SUMMARY_ERROR_PREFIX,
  ACTIVE_WAIT_INACTIVE_SUMMARY_STATE_PREFIX,
  ACTIVE_WAIT_INVARIANT_BREACH_MESSAGE_PREFIX,
  ACTIVE_WAIT_INVARIANT_BREACH_REASON_CODE,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CYCLES_PREFIX,
  ACTIVE_WAIT_STALLED_MESSAGE_PREFIX,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  CONTAINER_LOG_TAIL_LINES,
  LOG_COLLECTION_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  STARTUP_ADMISSION_STATE_BLOCKED,
  STARTUP_ADMISSION_STATE_DEGRADED,
  STARTUP_ADMISSION_STATE_STRONG_ACTIVE,
  STATUS_ACTIVE_LOWER,
  TIMEOUTS,
  UNKNOWN_REASON,
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
  summarizeInvariantBreaches,
  upsertActiveWaitBlockerHistory,
  withTimeout,
} = CLUSTER_STARTUP_GATE_LAYER;

import {
  buildActiveWaitReadinessFailure,
  isBetterActiveWaitSnapshotCoverageProgressSnapshot,
  selectActiveWaitReadinessDelay,
  selectStartupActiveGateSnapshotRepairContinuation,
  selectStartupActiveGateOwnerProgressContinuation,
  selectTerminalActiveWaitProgressSnapshot,
} from './cluster-active-wait-loop.js';
import {
  waitForLoadReadinessStability,
} from './cluster-load-readiness-stability.js';
import {
  buildOracleBlindFailureMessage,
  createOracleBlindnessTracker,
  markOracleBlindError,
  resolveActiveWaitOracleBlindness,
} from './oracle-blindness.js';

class Cluster extends ClusterControlSnapshotRecovery {
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
    const startupNoProgressConfigured =
      Number.isInteger(options.noProgressMaxAttempts) ||
      Number.isInteger(
        this._config?.timeouts?.activeWaitNoProgressMaxAttempts,
      );
    const noProgressMaxAttempts =
      readinessMode === CLUSTER_READINESS_MODE_LOAD ||
        startupNoProgressConfigured ?
        this._resolveActiveWaitNoProgressMaxAttempts(options, timeout) :
        null;
    const forceRepairThreshold = Date.now() + forceRepairAfterMs;
    const inactiveSummaryCounts = new Map();
    // CL-031: when the snapshot-coverage probe fails on EVERY node while
    // node-level evidence shows nothing wrong, the active-wait oracle is
    // BLIND — the failure must classify as oracle_blind, never as a cluster
    // stall/timeout.
    const oracleBlindnessTracker = createOracleBlindnessTracker();
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
    let startupOwnerProgressContinuationUsed = false;
    let startupSnapshotRepairContinuationUsed = false;

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

    const selectStartupTerminalProgressSnapshot = (lastResult) => {
      const observedProgressSnapshot =
        lastObservedProgressSnapshot ||
        buildActiveWaitProgressSnapshot(
          lastResult || {},
          this._nodes.size,
          {readinessMode},
        );
      return selectTerminalActiveWaitProgressSnapshot({
        currentProgressSnapshot: observedProgressSnapshot,
        lastMeaningfulProgressSnapshot,
        bestSnapshotCoverageProgressSnapshot,
      });
    };

    const extendStartupOwnerProgressDeadline = ({
      attempts,
      lastResult,
    }) => {
      if (startupOwnerProgressContinuationUsed) {
        return null;
      }
      const progressSnapshot = selectStartupTerminalProgressSnapshot(lastResult);
      const attemptsSinceProgress = Math.max(
        ZERO,
        attempts - (lastMeaningfulProgressAttempt || ZERO),
      );
      const continuation =
        selectStartupActiveGateOwnerProgressContinuation({
          readinessMode,
          progressSnapshot,
          probeResult: lastResult,
          attemptsSinceProgress,
          pollIntervalMs: ACTIVE_POLL_INTERVAL_MS,
        });
      if (continuation.continuePolling !== true) {
        return null;
      }
      startupOwnerProgressContinuationUsed = true;
      return {
        deadline: Date.now() + continuation.extendMs,
      };
    };

    const extendStartupSnapshotRepairDeadline = ({lastResult}) => {
      if (startupSnapshotRepairContinuationUsed) {
        return null;
      }
      const progressSnapshot = selectStartupTerminalProgressSnapshot(lastResult);
      const continuation =
        selectStartupActiveGateSnapshotRepairContinuation({
          readinessMode,
          progressSnapshot,
          pollIntervalMs: ACTIVE_POLL_INTERVAL_MS,
        });
      if (continuation.continuePolling !== true) {
        return null;
      }
      startupSnapshotRepairContinuationUsed = true;
      return {
        deadline: Date.now() + continuation.extendMs,
      };
    };

    const extendStartupActiveGateDeadline = (attemptResult) => {
      return (
        extendStartupOwnerProgressDeadline(attemptResult) ||
        extendStartupSnapshotRepairDeadline(attemptResult)
      );
    };

    let pollResult;
    try {
      pollResult = await pollUntilCondition({
        deadline,
        intervalMs: ACTIVE_POLL_INTERVAL_MS,
        sleep: (ms) => this._sleep(ms),
        probe: ({deadline: currentDeadline = deadline} = {}) => {
          const forceRepair = Date.now() >= forceRepairThreshold;
          return this._probeClusterActiveState(currentDeadline, {
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
        extendDeadline:
          readinessMode === CLUSTER_READINESS_MODE_STARTUP ?
            extendStartupActiveGateDeadline :
            null,
        onAttempt: ({attempts, elapsedMs, lastResult}) => {
          const snapshotBlindness = resolveActiveWaitOracleBlindness({
            snapshotCoverage: lastResult.snapshotCoverage,
            nodeDiagnostics: lastResult.nodeDiagnostics,
          });
          if (snapshotBlindness.blind) {
            oracleBlindnessTracker.recordBlindPoll(
              snapshotBlindness.transportError,
            );
          } else {
            oracleBlindnessTracker.recordSightedPoll();
          }
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
            const stalledOracleBlind =
              oracleBlindnessTracker.isBlindAtDecision();
            const stalledOracleBlindSummary =
              oracleBlindnessTracker.summarize();
            const stalledError = new Error(
              stalledOracleBlind ?
                buildOracleBlindFailureMessage({
                  oracleName: 'Active wait (mode=' + readinessMode + ')',
                  summary: stalledOracleBlindSummary,
                  elapsedMs,
                }) :
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
            if (stalledOracleBlind) {
              markOracleBlindError(stalledError, stalledOracleBlindSummary);
            }
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
    const timeoutOracleBlind = oracleBlindnessTracker.isBlindAtDecision();
    const timeoutOracleBlindSummary = oracleBlindnessTracker.summarize();
    const timeoutError = new Error(
      (timeoutOracleBlind ?
        buildOracleBlindFailureMessage({
          oracleName: 'Active wait (mode=' + readinessMode + ')',
          summary: timeoutOracleBlindSummary,
          budgetMs: timeout,
          elapsedMs: pollResult.elapsedMs,
        }) :
        'Not all nodes reached ' +
          ACTIVE_STATE +
          ' state within ' +
          timeout +
          'ms') +
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
    if (timeoutOracleBlind) {
      markOracleBlindError(timeoutError, timeoutOracleBlindSummary);
    }
    throw timeoutError;
  }

  async waitForLoadReadinessStability(options = {}) {
    return waitForLoadReadinessStability.call(this, options);
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

export const CLUSTER_CLASS_LAYER = {
  ...CLUSTER_STARTUP_GATE_LAYER,
  Cluster,
};
