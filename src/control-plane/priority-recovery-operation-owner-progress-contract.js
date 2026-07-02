import {
  TIME_MS,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_WAIT_MODE,
} from './priority-recovery-diagnostics-constants.js';
import {
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
} from '../rebalancer/operation-workflow-owner-constants.js';

const PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT = Object.freeze({
  DEFAULT_STATE: 'dispatch_pending',
  EVENT_WAKE_SOURCE: 'operation_lifecycle_event',
  REMOTE_HANDOFF_RETRY_WAKE_SOURCE: 'rebalancer_handoff_retry',
  RETRY_WAKE_SOURCE: 'rebalancer_timer',
  EVENT_OWNER_REENTRY_STATE: 'event_owner_reentry_observed',
  BOUNDED_OWNER_REENTRY_STATE: 'bounded_owner_reentry_scheduled',
  REPRESENTATIVE_RERUN_ELIGIBLE: 'eligible',
  REPRESENTATIVE_RERUN_BLOCKED_MODEL_ROUTE: 'blocked_model_route',
  TERMINAL_STATE: 'satisfied',
  EVIDENCE_PATH:
    'test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json',
  DEFAULT_BLOCKING_DEPENDENCY: 'operation_progress',
});

const PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT_TEXT_EMPTY = '';
const PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT_BOUNDARIES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
  ]));

function normalizePriorityRecoveryOperationOwnerProgressContractText(
  value,
  fallback,
) {
  const normalizedValue =
    typeof value === 'string' ?
      value.trim() :
      PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT_TEXT_EMPTY;
  return normalizedValue.length > 0 ? normalizedValue : fallback;
}

function isPriorityRecoveryOperationOwnerRemoteHandoffRetryProgress(progress) {
  return (
    progress?.waitMode === PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED ||
    progress?.waitMode === PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN
  ) &&
    progress?.blockingBoundary ===
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF;
}

function resolvePriorityRecoveryOperationOwnerProgressContractWakeSource(
  progress,
) {
  if (isPriorityRecoveryOperationOwnerRemoteHandoffRetryProgress(progress)) {
    return PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT
      .REMOTE_HANDOFF_RETRY_WAKE_SOURCE;
  }
  if (progress?.waitMode !== PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED) {
    return PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT
      .EVENT_WAKE_SOURCE;
  }
  return PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT.RETRY_WAKE_SOURCE;
}

function resolvePriorityRecoveryOperationOwnerProgressContractOwnerReentry(
  progress,
) {
  return isPriorityRecoveryOperationOwnerRemoteHandoffRetryProgress(progress) ?
    PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT
      .BOUNDED_OWNER_REENTRY_STATE :
    PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT
      .EVENT_OWNER_REENTRY_STATE;
}

function resolvePriorityRecoveryOperationOwnerRepresentativeRerunRoute(
  progress,
) {
  return isPriorityRecoveryOperationOwnerRemoteHandoffRetryProgress(progress) ?
    PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT
      .REPRESENTATIVE_RERUN_BLOCKED_MODEL_ROUTE :
    PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT
      .REPRESENTATIVE_RERUN_ELIGIBLE;
}

function resolvePriorityRecoveryOperationOwnerProgressContractRetryAfterMs(
  progress,
) {
  if (
    Number.isFinite(progress?.retryAfterMs) &&
    progress.retryAfterMs > 0
  ) {
    return Math.max(0, Math.floor(progress.retryAfterMs));
  }
  if (
    progress?.waitMode === PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED ||
    (progress?.waitMode === PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN &&
     progress?.blockingBoundary ===
       PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF)
  ) {
    return TIME_MS.SECOND;
  }
  return 0;
}

function buildPriorityRecoveryOperationOwnerProgressContract(result) {
  const progress = result.progress || {};
  const operationOwnerObservation = result.operationOwnerObservation || {};
  const boundary =
    normalizePriorityRecoveryOperationOwnerProgressContractText(
      progress.blockingBoundary,
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    );
  return Object.freeze({
    owner: OPERATION_WORKFLOW_OWNER,
    boundary,
    state: normalizePriorityRecoveryOperationOwnerProgressContractText(
      progress.contractState || progress.nextRequiredAction,
      PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT.DEFAULT_STATE,
    ),
    reason: normalizePriorityRecoveryOperationOwnerProgressContractText(
      operationOwnerObservation.outcome,
      OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS,
    ),
    nextAction: normalizePriorityRecoveryOperationOwnerProgressContractText(
      progress.nextAction || progress.nextRequiredAction,
      PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT.DEFAULT_STATE,
    ),
    ownerReentryState:
      resolvePriorityRecoveryOperationOwnerProgressContractOwnerReentry(
        progress,
      ),
    wakeSource:
      resolvePriorityRecoveryOperationOwnerProgressContractWakeSource(progress),
    representativeRerunRoute:
      resolvePriorityRecoveryOperationOwnerRepresentativeRerunRoute(progress),
    retryAfterMs:
      resolvePriorityRecoveryOperationOwnerProgressContractRetryAfterMs(
        progress,
      ),
    terminalState:
      PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT.TERMINAL_STATE,
    evidencePath:
      PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT.EVIDENCE_PATH,
    blockingDependency:
      normalizePriorityRecoveryOperationOwnerProgressContractText(
        progress.blockingBoundary,
        PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT
          .DEFAULT_BLOCKING_DEPENDENCY,
      ),
  });
}

function hasPriorityRecoveryOperationOwnerProgress(result) {
  const progress = result?.progress;
  return Boolean(
    result &&
      typeof result === 'object' &&
      progress &&
      typeof progress === 'object' &&
      progress.currentOwner === OPERATION_WORKFLOW_OWNER &&
      PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_CONTRACT_BOUNDARIES.has(
        progress.blockingBoundary,
      ),
  );
}

function attachPriorityRecoveryOperationOwnerProgressContract(result) {
  if (!hasPriorityRecoveryOperationOwnerProgress(result)) {
    return result;
  }
  const progressContract =
    buildPriorityRecoveryOperationOwnerProgressContract(result);
  return Object.freeze({
    ...result,
    progressContract,
    progress: Object.freeze({
      ...result.progress,
      progressContract,
    }),
    progressSummary: Object.freeze({
      ...(result.progressSummary || {}),
      progressContract,
    }),
  });
}

export {
  attachPriorityRecoveryOperationOwnerProgressContract,
  buildPriorityRecoveryOperationOwnerProgressContract,
};
