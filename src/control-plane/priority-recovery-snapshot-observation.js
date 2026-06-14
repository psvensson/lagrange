import {NUM, TYPEOF, WORKFLOW_STEP} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from './priority-recovery-diagnostics-constants.js';
import {PRIORITY_RECOVERY_COMPLETION_STATE} from './priority-recovery-completion.js';
import {
  buildPriorityRecoveryPressureConditions,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  ReplicaStatus,
  isReplaceRemoveDispatchPhase,
} from '../rebalancer/replica-status.js';
import {resolveStepTimeoutMs} from '../rebalancer/replica-operation-liveness.js';
import {
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_CONVERGENCE_STATE,
  PRIORITY_RECOVERY_DISPATCHED_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_NO_TRANSITION_BLOCKING_STATES,
  PRIORITY_RECOVERY_OPERATION_TRANSITION_RULES,
  PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE,
  PRIORITY_RECOVERY_SNAPSHOT_LITERAL,
  PRIORITY_RECOVERY_VISIBILITY_STATE,
  PRIORITY_RECOVERY_WORKFLOW_STATE,
} from './priority-recovery-snapshot-contract.js';
import {isPriorityRecoveryOperationContextTerminal} from './priority-recovery-snapshot-rebalancer.js';

function resolvePriorityRecoveryWorkflowState(operationContexts = []) {
  const normalizedContexts = Array.isArray(operationContexts) ?
    operationContexts.filter(
      (operationContext) =>
        operationContext && typeof operationContext === TYPEOF.OBJECT,
    ) :
    [];
  if (normalizedContexts.length === NUM.ZERO) {
    return PRIORITY_RECOVERY_WORKFLOW_STATE.NONE;
  }
  if (
    normalizedContexts.every((operationContext) =>
      isPriorityRecoveryOperationContextTerminal(operationContext),
    )
  ) {
    return PRIORITY_RECOVERY_WORKFLOW_STATE.TERMINAL;
  }
  if (
    normalizedContexts.some((operationContext) =>
      isReplaceRemoveDispatchPhase(operationContext),
    )
  ) {
    return PRIORITY_RECOVERY_WORKFLOW_STATE.REMOVE_PHASE;
  }
  return PRIORITY_RECOVERY_WORKFLOW_STATE.IN_FLIGHT;
}

function resolvePriorityRecoveryVisibilityState(options = {}) {
  const completion =
    options.completion && typeof options.completion === TYPEOF.OBJECT ?
      options.completion :
      null;
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  if (
    completion?.state ===
      PRIORITY_RECOVERY_COMPLETION_STATE.OPERATION_VISIBILITY_DEFERRED ||
    options.authoritativeOperationReadDeferred === true
  ) {
    return PRIORITY_RECOVERY_VISIBILITY_STATE.DEFERRED;
  }
  if (operationContexts.length > NUM.ZERO) {
    return PRIORITY_RECOVERY_VISIBILITY_STATE.CACHE_VISIBLE;
  }
  if (
    resolvePriorityRecoveryWorkflowState(operationContexts) ===
    PRIORITY_RECOVERY_WORKFLOW_STATE.NONE
  ) {
    return PRIORITY_RECOVERY_VISIBILITY_STATE.NONE;
  }
  return PRIORITY_RECOVERY_VISIBILITY_STATE.UNKNOWN;
}

function resolvePriorityRecoveryConvergenceState(assessment = null) {
  if (!assessment || typeof assessment !== TYPEOF.OBJECT) {
    return PRIORITY_RECOVERY_CONVERGENCE_STATE.SPREAD_GAP;
  }
  if (assessment?.planner?.ready === true) {
    return PRIORITY_RECOVERY_CONVERGENCE_STATE.CONVERGED;
  }
  if (assessment?.spreadCompletion?.satisfied === true) {
    return PRIORITY_RECOVERY_CONVERGENCE_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_CONVERGENCE_STATE.SPREAD_GAP;
}

function resolvePriorityRecoveryOperationProgressTimestampMs(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return NUM.ZERO;
  }
  const progressTimestampCandidates = [
    normalizePriorityRecoveryInteger(operationContext.completedAtMs),
    normalizePriorityRecoveryInteger(operationContext.updatedAtMs),
    normalizePriorityRecoveryInteger(operationContext.targetServiceProgressAtMs),
    normalizePriorityRecoveryInteger(operationContext.createdAtMs),
  ].filter((timestampMs) =>
    Number.isFinite(timestampMs) && timestampMs > NUM.ZERO,
  );
  return progressTimestampCandidates.length > NUM.ZERO ?
    Math.max(...progressTimestampCandidates) :
    NUM.ZERO;
}

function resolvePriorityRecoveryWorkflowProgressPhaseId(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.NONE;
  }
  const workflowStep = String(
    operationContext?.workflowStep || '',
  ).toUpperCase();
  if (
    workflowStep === WORKFLOW_STEP.PENDING ||
    workflowStep === WORKFLOW_STEP.SENDING
  ) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING;
  }
  if (workflowStep === WORKFLOW_STEP.CREATING) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION;
  }
  if (workflowStep === WORKFLOW_STEP.SYNCING) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC;
  }
  if (
    workflowStep === WORKFLOW_STEP.ACTIVE ||
    workflowStep === WORKFLOW_STEP.STOPPING
  ) {
    return isReplaceRemoveDispatchPhase(operationContext) ?
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL :
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.UNKNOWN;
  }
  if (isPriorityRecoveryOperationContextTerminal(operationContext) === true) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL;
  }
  return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.UNKNOWN;
}

function resolvePriorityRecoveryWorkflowStepAgeMs(
  operationContext,
  nowMs = null,
) {
  const targetServiceProgressAtMs = normalizePriorityRecoveryInteger(
    operationContext?.targetServiceProgressAtMs,
  );
  const referenceNowMs = normalizePriorityRecoveryInteger(nowMs);
  const progressAtMs =
    resolvePriorityRecoveryOperationProgressTimestampMs(operationContext);
  if (
    Number.isFinite(targetServiceProgressAtMs) &&
    targetServiceProgressAtMs > NUM.ZERO &&
    Number.isFinite(referenceNowMs) &&
    Number.isFinite(progressAtMs) &&
    referenceNowMs >= progressAtMs
  ) {
    return Math.max(NUM.ZERO, referenceNowMs - progressAtMs);
  }
  const ageMs = normalizePriorityRecoveryInteger(operationContext?.ageMs);
  if (Number.isFinite(ageMs) && ageMs >= NUM.ZERO) {
    return ageMs;
  }
  if (
    Number.isFinite(referenceNowMs) &&
    Number.isFinite(progressAtMs) &&
    referenceNowMs >= progressAtMs
  ) {
    return Math.max(NUM.ZERO, referenceNowMs - progressAtMs);
  }
  return null;
}

function resolvePriorityRecoveryWorkflowStepTimeoutMs(
  operationContext,
  options = {},
) {
  const stepTimeoutMs = normalizePriorityRecoveryInteger(
    operationContext?.stepTimeoutMs,
  );
  if (Number.isFinite(stepTimeoutMs) && stepTimeoutMs > NUM.ZERO) {
    return stepTimeoutMs;
  }
  const stepTimeoutMsByWorkflowStep =
    options.stepTimeoutMsByWorkflowStep &&
    typeof options.stepTimeoutMsByWorkflowStep === TYPEOF.OBJECT ?
      options.stepTimeoutMsByWorkflowStep :
      null;
  const workflowStep = String(operationContext?.workflowStep || '').trim();
  if (workflowStep.length === NUM.ZERO) {
    return null;
  }
  return normalizePriorityRecoveryInteger(
    resolveStepTimeoutMs(workflowStep, {
      stepTimeoutMsByWorkflowStep,
    }),
  );
}

function buildPriorityRecoveryWorkflowProgressMetrics(options = {}) {
  const latestOperationContext =
    options.latestOperationContext &&
    typeof options.latestOperationContext === TYPEOF.OBJECT ?
      options.latestOperationContext :
      null;
  const nowMs = normalizePriorityRecoveryInteger(options.nowMs);
  const stepTimeoutMsByWorkflowStep =
    options.stepTimeoutMsByWorkflowStep &&
    typeof options.stepTimeoutMsByWorkflowStep === TYPEOF.OBJECT ?
      options.stepTimeoutMsByWorkflowStep :
      null;
  const workflowProgressPhaseId =
    resolvePriorityRecoveryWorkflowProgressPhaseId(latestOperationContext);
  const stepAgeMs = resolvePriorityRecoveryWorkflowStepAgeMs(
    latestOperationContext,
    nowMs,
  );
  const stepTimeoutMs = resolvePriorityRecoveryWorkflowStepTimeoutMs(
    latestOperationContext,
    {stepTimeoutMsByWorkflowStep},
  );
  return Object.freeze({
    workflowProgressPhaseId,
    ...(Number.isFinite(stepAgeMs) ? {stepAgeMs} : {}),
    ...(Number.isFinite(stepTimeoutMs) ? {stepTimeoutMs} : {}),
    timeoutReconcileDue:
      Number.isFinite(stepAgeMs) &&
      Number.isFinite(stepTimeoutMs) &&
      stepTimeoutMs > NUM.ZERO &&
      stepAgeMs >= stepTimeoutMs,
  });
}

function buildPriorityRecoveryOperationTransitionEvidence(
  operationContext,
  options = {},
) {
  const stepAgeMs =
    resolvePriorityRecoveryWorkflowStepAgeMs(
      operationContext,
      options.nowMs,
    );
  const stepTimeoutMs =
    resolvePriorityRecoveryWorkflowStepTimeoutMs(operationContext, {
      stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
    });
  const timelineStepCount = Math.max(
    NUM.ZERO,
    normalizePriorityRecoveryInteger(operationContext?.timelineStepCount) ||
      NUM.ZERO,
  );
  const timeoutReconcileDue =
    Number.isFinite(stepAgeMs) &&
    Number.isFinite(stepTimeoutMs) &&
    stepTimeoutMs > NUM.ZERO &&
    stepAgeMs >= stepTimeoutMs;
  const ownerWaitWindowOpen =
    Number.isFinite(stepAgeMs) &&
    Number.isFinite(stepTimeoutMs) &&
    stepTimeoutMs > NUM.ZERO &&
    stepAgeMs < stepTimeoutMs;
  return Object.freeze({
    timelineStepCount,
    timeoutReconcileDue,
    ownerWaitWindowOpen,
  });
}

function resolvePriorityRecoveryOperationTransitionState(
  operationContext,
  options = {},
) {
  const evidence =
    buildPriorityRecoveryOperationTransitionEvidence(
      operationContext,
      options,
    );
  return PRIORITY_RECOVERY_OPERATION_TRANSITION_RULES.find((rule) =>
    rule.matches(evidence),
  ).state;
}

function isPriorityRecoveryNoTransitionBlocker(
  operationContext,
  options = {},
) {
  return PRIORITY_RECOVERY_NO_TRANSITION_BLOCKING_STATES.has(
    resolvePriorityRecoveryOperationTransitionState(operationContext, options),
  );
}

function arePriorityRecoveryBlockingOperationsWithoutOwnedTransitions(
  operationContexts = [],
  options = {},
) {
  const normalizedOperationContexts = Array.isArray(operationContexts) ?
    operationContexts.filter(
      (operationContext) =>
        operationContext && typeof operationContext === TYPEOF.OBJECT,
    ) :
    [];
  return (
    normalizedOperationContexts.length > NUM.ZERO &&
    normalizedOperationContexts.every((operationContext) =>
      isPriorityRecoveryNoTransitionBlocker(operationContext, options),
    )
  );
}

function selectLatestPriorityRecoveryOperationContext(operationContexts = []) {
  const normalizedContexts = Array.isArray(operationContexts) ?
    operationContexts.filter(
      (operationContext) =>
        operationContext && typeof operationContext === TYPEOF.OBJECT,
    ) :
    [];
  if (normalizedContexts.length === NUM.ZERO) {
    return null;
  }
  return (
    normalizedContexts.slice().sort((left, right) => {
      return (
        resolvePriorityRecoveryOperationProgressTimestampMs(right) -
        resolvePriorityRecoveryOperationProgressTimestampMs(left)
      );
    })[NUM.ZERO] || null
  );
}

function hasPriorityRecoveryScheduledRetry(retryAfterMs) {
  return Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO;
}

function buildPriorityRecoveryProgressEvidenceSourceIds(options = {}) {
  const evidenceSourceIds = [];
  if (
    typeof options.completionState === TYPEOF.STRING &&
    options.completionState.length > NUM.ZERO
  ) {
    evidenceSourceIds.push(
      PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.COMPLETION_STATE,
    );
  }
  if (
    typeof options.workflowState === TYPEOF.STRING &&
    options.workflowState.length > NUM.ZERO
  ) {
    evidenceSourceIds.push(
      PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.WORKFLOW_STATE,
    );
  }
  if (options.hasOperationContext === true) {
    evidenceSourceIds.push(
      PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.OPERATION_CONTEXT,
    );
  }
  if (options.hasTimelineEvidence === true) {
    evidenceSourceIds.push(PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.TIMELINE);
  }
  if (options.hasBlockerReasons === true) {
    evidenceSourceIds.push(
      PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.BLOCKER_REASONS,
    );
  }
  if (
    Number.isFinite(options.lastProgressAtMs) &&
    options.lastProgressAtMs > NUM.ZERO
  ) {
    evidenceSourceIds.push(
      PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.LAST_PROGRESS_TIMESTAMP,
    );
  }
  return Object.freeze(normalizePriorityRecoveryStringList(evidenceSourceIds));
}

function buildPriorityRecoveryConditionsContract(options = {}) {
  const observation =
    options.observation && typeof options.observation === TYPEOF.OBJECT ?
      options.observation :
      null;
  const assessment =
    options.assessment && typeof options.assessment === TYPEOF.OBJECT ?
      options.assessment :
      null;
  const admission =
    options.admission && typeof options.admission === TYPEOF.OBJECT ?
      options.admission :
      null;
  const latestOperationContext =
    options.latestOperationContext &&
    typeof options.latestOperationContext === TYPEOF.OBJECT ?
      options.latestOperationContext :
      null;
  const pressure = buildPriorityRecoveryPressureConditions(options.logsTable);
  const visibilityState = String(
    observation?.visibilityState || PRIORITY_RECOVERY_VISIBILITY_STATE.NONE,
  ).trim();
  const latestOperationWorkflowStep =
    typeof latestOperationContext?.workflowStep === TYPEOF.STRING ?
      latestOperationContext.workflowStep.trim() :
      PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE;
  const latestOperationStatus =
    typeof latestOperationContext?.status === TYPEOF.STRING ?
      latestOperationContext.status.trim() :
      PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE;
  return Object.freeze({
    visibilityState,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
    blockerReasonCodes: Object.freeze(
      normalizePriorityRecoveryStringList(assessment?.blockerReasons),
    ),
    admissionBlockingReasonCodes: Object.freeze(
      normalizePriorityRecoveryStringList(admission?.blockingReasons),
    ),
    pressure,
    ...(latestOperationWorkflowStep.length > NUM.ZERO ?
      {latestOperationWorkflowStep} :
      {}),
    ...(latestOperationStatus.length > NUM.ZERO ? {latestOperationStatus} : {}),
  });
}

function buildPriorityRecoveryActuationShape(options = {}) {
  return {
    workflowProgressPhaseId: options.progressMetrics.workflowProgressPhaseId,
    owner: PRIORITY_RECOVERY_PROGRESS_OWNER.NONE,
    state: PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
    operationCount: options.operationCount,
    ...(options.latestOperationId ?
      {latestOperationId: options.latestOperationId} :
      {}),
    ...(Number.isFinite(options.progressMetrics.stepAgeMs) ?
      {stepAgeMs: options.progressMetrics.stepAgeMs} :
      {}),
    ...(Number.isFinite(options.progressMetrics.stepTimeoutMs) ?
      {stepTimeoutMs: options.progressMetrics.stepTimeoutMs} :
      {}),
    ...(Number.isFinite(options.lastProgressAtMs) ?
      {lastProgressAtMs: options.lastProgressAtMs} :
      {}),
    ...(Number.isFinite(options.retryAfterMs) ?
      {retryAfterMs: options.retryAfterMs} :
      {}),
    timeoutReconcileDue: options.progressMetrics.timeoutReconcileDue === true,
  };
}

function buildPriorityRecoveryActuationSnapshot(actuationShape, owner, state) {
  return Object.freeze({
    ...actuationShape,
    owner,
    state,
  });
}

function isPriorityRecoveryObservationDeferred(options = {}) {
  return (
    options.completionState ===
      PRIORITY_RECOVERY_COMPLETION_STATE.OPERATION_VISIBILITY_DEFERRED ||
    options.visibilityState === PRIORITY_RECOVERY_VISIBILITY_STATE.DEFERRED ||
    options.authoritativeOperationReadDeferred === true
  );
}

function resolvePriorityRecoveryInFlightActuationState(
  workflowState,
  progressMetrics,
  latestOperationContext,
) {
  if (
    workflowState !== PRIORITY_RECOVERY_WORKFLOW_STATE.IN_FLIGHT &&
    workflowState !== PRIORITY_RECOVERY_WORKFLOW_STATE.REMOVE_PHASE
  ) {
    return null;
  }
  return resolvePriorityRecoveryDispatchedActuationState(
    latestOperationContext,
  );
}

function resolvePriorityRecoveryDispatchedActuationState(
  latestOperationContext,
) {
  const workflowStep = String(
    latestOperationContext?.workflowStep || LOCAL_STR_EMPTY,
  ).toUpperCase();
  return PRIORITY_RECOVERY_DISPATCHED_WORKFLOW_STEPS.has(workflowStep) ?
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS :
    PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED;
}

function resolvePriorityRecoveryFollowupActuationState(options = {}) {
  if (options.missingFollowupOperation !== true) {
    return null;
  }
  if (options.blocksCriticalRecoveryActuation === true) {
    return PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED;
  }
  if (options.scheduledRetry === true) {
    return PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED;
  }
  return PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED;
}

function resolvePriorityRecoveryTerminalActuationState(latestOperationContext) {
  const status = String(
    latestOperationContext?.status || LOCAL_STR_EMPTY,
  ).toLowerCase();
  return status === ReplicaStatus.FAILED ?
    PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_FAILED :
    PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_COMPLETED;
}

function buildPriorityRecoveryActuationDecisionEvidence(options = {}) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    options.blockerReasons,
  );
  const priorityOperationSerialWait = blockerReasons.includes(
    PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
  );
  const missingFollowupOperation = blockerReasons.includes(
    PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  );
  const followupActuationState = resolvePriorityRecoveryFollowupActuationState({
    missingFollowupOperation,
    blocksCriticalRecoveryActuation:
      options.blocksCriticalRecoveryActuation === true,
    scheduledRetry: options.scheduledRetry === true,
  });
  const inFlightActuationState = resolvePriorityRecoveryInFlightActuationState(
    options.workflowState,
    options.progressMetrics,
    options.latestOperationContext,
  );
  return Object.freeze({
    completionState: options.completionState,
    followupActuationState,
    inFlightActuationState,
    latestOperationContext: options.latestOperationContext,
    missingFollowupOperation,
    observationDeferred: isPriorityRecoveryObservationDeferred({
      completionState: options.completionState,
      visibilityState: options.visibilityState,
      authoritativeOperationReadDeferred:
        options.authoritativeOperationReadDeferred === true,
    }),
    operationNoTransitions: blockerReasons.includes(
      PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
    ),
    priorityOperationSerialWait,
    workflowState: options.workflowState,
  });
}

export {
  arePriorityRecoveryBlockingOperationsWithoutOwnedTransitions,
  buildPriorityRecoveryActuationDecisionEvidence,
  buildPriorityRecoveryActuationShape,
  buildPriorityRecoveryActuationSnapshot,
  buildPriorityRecoveryConditionsContract,
  buildPriorityRecoveryOperationTransitionEvidence,
  buildPriorityRecoveryProgressEvidenceSourceIds,
  buildPriorityRecoveryWorkflowProgressMetrics,
  hasPriorityRecoveryScheduledRetry,
  isPriorityRecoveryNoTransitionBlocker,
  isPriorityRecoveryObservationDeferred,
  resolvePriorityRecoveryConvergenceState,
  resolvePriorityRecoveryDispatchedActuationState,
  resolvePriorityRecoveryFollowupActuationState,
  resolvePriorityRecoveryInFlightActuationState,
  resolvePriorityRecoveryOperationProgressTimestampMs,
  resolvePriorityRecoveryOperationTransitionState,
  resolvePriorityRecoveryTerminalActuationState,
  resolvePriorityRecoveryVisibilityState,
  resolvePriorityRecoveryWorkflowProgressPhaseId,
  resolvePriorityRecoveryWorkflowState,
  resolvePriorityRecoveryWorkflowStepAgeMs,
  resolvePriorityRecoveryWorkflowStepTimeoutMs,
  selectLatestPriorityRecoveryOperationContext,
};
