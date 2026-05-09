import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
} from './priority-recovery-diagnostics-constants.js';
import {PRIORITY_RECOVERY_COMPLETION_STATE} from './priority-recovery-completion.js';
import {
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  buildOwnerContractOutcome,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from './owner-contract-outcome.js';
import {
  LOCAL_EMPTY_LIST,
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_ACTUATION_DECISION,
  PRIORITY_RECOVERY_VISIBILITY_STATE,
  PRIORITY_RECOVERY_WORKFLOW_STATE,
} from './priority-recovery-snapshot-stage-shared.js';
import {buildPriorityRecoveryActuationDecisionEvidence, buildPriorityRecoveryActuationShape, buildPriorityRecoveryActuationSnapshot, buildPriorityRecoveryConditionsContract, buildPriorityRecoveryProgressEvidenceSourceIds, buildPriorityRecoveryWorkflowProgressMetrics, hasPriorityRecoveryScheduledRetry, isPriorityRecoveryObservationDeferred, resolvePriorityRecoveryOperationProgressTimestampMs, resolvePriorityRecoveryTerminalActuationState, selectLatestPriorityRecoveryOperationContext} from './priority-recovery-snapshot-stage-7.js';

const PRIORITY_RECOVERY_ACTUATION_DECISION_TABLE = Object.freeze([
  Object.freeze({
    decision: PRIORITY_RECOVERY_ACTUATION_DECISION.VISIBILITY_DEFERRED,
    matches: (evidence) => evidence.observationDeferred === true,
    build: () => ({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.AUTHORITATIVE_VISIBILITY_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_ACTUATION_DECISION.SERIAL_WAIT,
    matches: (evidence) => evidence.priorityOperationSerialWait === true,
    build: () => ({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_ACTUATION_DECISION.FOLLOWUP_OPERATION,
    matches: (evidence) => Boolean(evidence.followupActuationState),
    build: (evidence) => ({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      state: evidence.followupActuationState,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_ACTUATION_DECISION.IN_FLIGHT_OPERATION,
    matches: (evidence) => Boolean(evidence.inFlightActuationState),
    build: (evidence) => ({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: evidence.inFlightActuationState,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_ACTUATION_DECISION.CONVERGED,
    matches: (evidence) =>
      evidence.completionState === PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
    build: () => ({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.NONE,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.NO_ACTION_NEEDED,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_ACTUATION_DECISION.OPERATION_NO_TRANSITIONS,
    matches: (evidence) => evidence.operationNoTransitions === true,
    build: () => ({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_ACTUATION_DECISION.TERMINAL_OPERATION,
    matches: (evidence) =>
      evidence.workflowState === PRIORITY_RECOVERY_WORKFLOW_STATE.TERMINAL,
    build: (evidence) => ({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      state: resolvePriorityRecoveryTerminalActuationState(
        evidence.latestOperationContext,
      ),
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_ACTUATION_DECISION.DEFAULT_FOLLOWUP,
    matches: () => true,
    build: () => ({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
    }),
  }),
]);

function resolvePriorityRecoveryActuationDecision(evidence = {}) {
  const decisionRule = PRIORITY_RECOVERY_ACTUATION_DECISION_TABLE.find((rule) =>
    rule.matches(evidence),
  );
  return Object.freeze(decisionRule.build(evidence));
}

function resolvePriorityRecoveryObjectOption(value) {
  return value && typeof value === TYPEOF.OBJECT ? value : null;
}

function resolvePriorityRecoveryOperationContextsOption(options = {}) {
  return Array.isArray(options.operationContexts) ?
    options.operationContexts :
    LOCAL_EMPTY_LIST;
}

function resolvePriorityRecoveryLatestOperationContextOption(
  options,
  operationContexts,
) {
  const explicitOperationContext = resolvePriorityRecoveryObjectOption(
    options.latestOperationContext,
  );
  return explicitOperationContext ||
    selectLatestPriorityRecoveryOperationContext(operationContexts);
}

function buildPriorityRecoveryContractInputContext(options = {}) {
  const operationContexts =
    resolvePriorityRecoveryOperationContextsOption(options);
  return Object.freeze({
    assessment: resolvePriorityRecoveryObjectOption(options.assessment),
    completion: resolvePriorityRecoveryObjectOption(options.completion),
    latestOperationContext:
      resolvePriorityRecoveryLatestOperationContextOption(
        options,
        operationContexts,
      ),
    observation: resolvePriorityRecoveryObjectOption(options.observation),
    operationContexts,
  });
}

function resolvePriorityRecoveryConditionsOption(options = {}, inputContext) {
  const explicitConditions = resolvePriorityRecoveryObjectOption(
    options.conditions,
  );
  if (explicitConditions) {
    return explicitConditions;
  }
  return buildPriorityRecoveryConditionsContract({
    observation: inputContext.observation,
    assessment: inputContext.assessment,
    admission: options.admission,
    latestOperationContext: inputContext.latestOperationContext,
    logsTable: options.logsTable,
    authoritativeOperationReadDeferred:
        options.authoritativeOperationReadDeferred === true,
  });
}

function resolvePriorityRecoveryContractCompletionState(inputContext) {
  return String(inputContext.completion?.state || LOCAL_STR_EMPTY).trim();
}

function resolvePriorityRecoveryContractWorkflowState(inputContext) {
  return String(
    inputContext.observation?.workflowState ||
      PRIORITY_RECOVERY_WORKFLOW_STATE.NONE,
  ).trim();
}

function resolvePriorityRecoveryContractBlockerReasons(inputContext) {
  return normalizePriorityRecoveryStringList(
    inputContext.assessment?.blockerReasons,
  );
}

function resolvePriorityRecoveryContractNowMs(options, inputContext) {
  return normalizePriorityRecoveryInteger(
    options.nowMs ?? inputContext.observation?.provenance?.capturedAt,
  );
}

function resolvePriorityRecoveryContractRetryAfterMs(inputContext) {
  return normalizePriorityRecoveryInteger(
    inputContext.completion?.retryAfterMs,
  );
}

function resolvePriorityRecoveryContractLastProgressAtMs(inputContext) {
  return resolvePriorityRecoveryOperationProgressTimestampMs(
    inputContext.latestOperationContext,
  ) ||
    normalizePriorityRecoveryInteger(
      inputContext.observation?.provenance?.capturedAt,
    ) ||
    null;
}

function buildPriorityRecoveryActuationContext(options = {}) {
  const inputContext = buildPriorityRecoveryContractInputContext(options);
  const conditions = resolvePriorityRecoveryConditionsOption(
    options,
    inputContext,
  );
  const nowMs = resolvePriorityRecoveryContractNowMs(options, inputContext);
  const progressMetrics = buildPriorityRecoveryWorkflowProgressMetrics({
    latestOperationContext: inputContext.latestOperationContext,
    nowMs,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
  });
  const retryAfterMs = resolvePriorityRecoveryContractRetryAfterMs(inputContext);
  const scheduledRetry = hasPriorityRecoveryScheduledRetry(retryAfterMs);
  const lastProgressAtMs =
    resolvePriorityRecoveryContractLastProgressAtMs(inputContext);
  const actuationShape = buildPriorityRecoveryActuationShape({
    progressMetrics,
    operationCount: inputContext.operationContexts.length,
    latestOperationId:
      inputContext.latestOperationContext?.operationId || null,
    lastProgressAtMs,
    retryAfterMs,
  });
  return Object.freeze({
    actuationShape,
    blockerReasons:
      resolvePriorityRecoveryContractBlockerReasons(inputContext),
    blocksCriticalRecoveryActuation:
      conditions?.pressure?.blocksCriticalRecoveryActuation === true,
    completionState: resolvePriorityRecoveryContractCompletionState(inputContext),
    latestOperationContext: inputContext.latestOperationContext,
    progressMetrics,
    scheduledRetry,
    visibilityState: conditions?.visibilityState,
    workflowState: resolvePriorityRecoveryContractWorkflowState(inputContext),
  });
}

function buildPriorityRecoveryActuationContract(options = {}) {
  const actuationContext = buildPriorityRecoveryActuationContext(options);
  const decision = resolvePriorityRecoveryActuationDecision(
    buildPriorityRecoveryActuationDecisionEvidence({
      blockerReasons: actuationContext.blockerReasons,
      blocksCriticalRecoveryActuation:
        actuationContext.blocksCriticalRecoveryActuation,
      scheduledRetry: actuationContext.scheduledRetry,
      completionState: actuationContext.completionState,
      latestOperationContext: actuationContext.latestOperationContext,
      progressMetrics: actuationContext.progressMetrics,
      visibilityState: actuationContext.visibilityState,
      workflowState: actuationContext.workflowState,
      authoritativeOperationReadDeferred:
        options.authoritativeOperationReadDeferred === true,
    }),
  );
  return buildPriorityRecoveryActuationSnapshot(
    actuationContext.actuationShape,
    decision.owner,
    decision.state,
  );
}

function buildPriorityRecoveryProgressOutcome(options = {}) {
  return Object.freeze({
    ...buildOwnerContractOutcome({
      contractState: options.contractState,
      nextAction: options.nextAction,
    }),
    ...options.progressShape,
    currentOwner: options.currentOwner,
    nextRequiredAction: options.nextRequiredAction,
    blockingBoundary: options.blockingBoundary,
    waitMode: options.waitMode,
    lastProgressAtMs: options.lastProgressAtMs,
    retryAfterMs: options.retryAfterMs,
    evidenceSourceIds: options.evidenceSourceIds,
  });
}

function buildPriorityRecoveryRetryScheduledDescriptor(defaultWaitMode) {
  return {
    contractState: OWNER_CONTRACT_STATE.PENDING,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    waitMode: defaultWaitMode,
  };
}

function buildPriorityRecoveryPendingDescriptor(
  scheduledRetry,
  defaultWaitMode,
) {
  if (scheduledRetry) {
    return buildPriorityRecoveryRetryScheduledDescriptor(
      PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
    );
  }
  return {
    contractState: OWNER_CONTRACT_STATE.PENDING,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    waitMode: defaultWaitMode,
  };
}

function buildPriorityRecoveryBlockedDescriptor(
  scheduledRetry,
  defaultWaitMode,
) {
  if (scheduledRetry) {
    return buildPriorityRecoveryRetryScheduledDescriptor(
      PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
    );
  }
  return {
    contractState: OWNER_CONTRACT_STATE.BLOCKED,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
    waitMode: defaultWaitMode,
  };
}

function resolvePriorityRecoveryContractVisibilityState(inputContext) {
  return String(
    inputContext.observation?.visibilityState ||
      PRIORITY_RECOVERY_VISIBILITY_STATE.NONE,
  ).trim();
}

function resolvePriorityRecoveryActuationOption(
  options = {},
  inputContext,
  conditions,
) {
  const explicitActuation = resolvePriorityRecoveryObjectOption(
    options.actuation,
  );
  if (explicitActuation) {
    return explicitActuation;
  }
  return buildPriorityRecoveryActuationContract({
    ...options,
    assessment: inputContext.assessment,
    completion: inputContext.completion,
    conditions,
    latestOperationContext: inputContext.latestOperationContext,
    observation: inputContext.observation,
    operationContexts: inputContext.operationContexts,
  });
}

function buildPriorityRecoveryProgressShape(actuation) {
  return Object.freeze({
    workflowProgressPhaseId: actuation.workflowProgressPhaseId,
    ...(Number.isFinite(actuation.stepAgeMs) ?
      {stepAgeMs: actuation.stepAgeMs} :
      {}),
    ...(Number.isFinite(actuation.stepTimeoutMs) ?
      {stepTimeoutMs: actuation.stepTimeoutMs} :
      {}),
  });
}

function resolvePriorityRecoveryProgressLastProgressAtMs(
  actuation,
  inputContext,
) {
  return Number.isFinite(actuation.lastProgressAtMs) ?
    actuation.lastProgressAtMs :
    resolvePriorityRecoveryContractLastProgressAtMs(inputContext);
}

function buildPriorityRecoveryProgressContext(options = {}) {
  const inputContext = buildPriorityRecoveryContractInputContext(options);
  const conditions = resolvePriorityRecoveryConditionsOption(
    options,
    inputContext,
  );
  const actuation = resolvePriorityRecoveryActuationOption(
    options,
    inputContext,
    conditions,
  );
  const blockerReasons =
    resolvePriorityRecoveryContractBlockerReasons(inputContext);
  const retryAfterMs = resolvePriorityRecoveryContractRetryAfterMs(inputContext);
  const scheduledRetry = hasPriorityRecoveryScheduledRetry(retryAfterMs);
  const completionState = resolvePriorityRecoveryContractCompletionState(
    inputContext,
  );
  const workflowState = resolvePriorityRecoveryContractWorkflowState(
    inputContext,
  );
  const visibilityState = resolvePriorityRecoveryContractVisibilityState(
    inputContext,
  );
  const nowMs = resolvePriorityRecoveryContractNowMs(options, inputContext);
  const progressMetrics = buildPriorityRecoveryWorkflowProgressMetrics({
    latestOperationContext: inputContext.latestOperationContext,
    nowMs,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
  });
  const lastProgressAtMs = resolvePriorityRecoveryProgressLastProgressAtMs(
    actuation,
    inputContext,
  );
  const evidenceSourceIds = buildPriorityRecoveryProgressEvidenceSourceIds({
    completionState,
    workflowState,
    hasOperationContext: inputContext.latestOperationContext !== null,
    hasTimelineEvidence:
      Number(inputContext.latestOperationContext?.timelineLength || NUM.ZERO) >
        NUM.ZERO,
    hasBlockerReasons: blockerReasons.length > NUM.ZERO,
    lastProgressAtMs,
  });
  return {
    actuation,
    blockerReasons,
    completionState,
    evidenceSourceIds,
    lastProgressAtMs,
    progressMetrics,
    progressShape: buildPriorityRecoveryProgressShape(actuation),
    retryAfterMs,
    scheduledRetry,
    visibilityState,
    workflowState,
  };
}

function resolvePriorityRecoveryInFlightProgressDescriptor(options = {}) {
  const workflowOwned =
    options.workflowState === PRIORITY_RECOVERY_WORKFLOW_STATE.IN_FLIGHT ||
    options.workflowState === PRIORITY_RECOVERY_WORKFLOW_STATE.REMOVE_PHASE;
  if (!workflowOwned) {
    return null;
  }
  if (options.progressMetrics.timeoutReconcileDue === true) {
    return {
      ...buildPriorityRecoveryPendingDescriptor(
        false,
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    };
  }
  return {
    ...buildPriorityRecoveryPendingDescriptor(
      options.scheduledRetry,
      PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    ),
    currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    nextRequiredAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
    blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
  };
}

function buildPriorityRecoveryReadyDescriptor() {
  return {
    contractState: OWNER_CONTRACT_STATE.READY,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
    waitMode: PRIORITY_RECOVERY_WAIT_MODE.NONE,
  };
}

function buildPriorityRecoveryProgressDecisionDescriptor(options = {}) {
  return {
    ...options.contractDescriptor,
    currentOwner: options.currentOwner,
    nextRequiredAction: options.nextRequiredAction,
    blockingBoundary: options.blockingBoundary,
  };
}

function buildPriorityRecoveryProgressDecisionEvidence(
  progressContext,
  options = {},
) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    progressContext.blockerReasons,
  );
  const priorityOperationSerialWait = blockerReasons.includes(
    PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
  );
  const missingFollowupOperation = blockerReasons.includes(
    PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  );
  const transitionDeferredSchedulingActuation =
    progressContext.actuation.state ===
      PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED &&
    progressContext.actuation.owner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER &&
    missingFollowupOperation;
  const inFlightDescriptor = resolvePriorityRecoveryInFlightProgressDescriptor({
    workflowState: progressContext.workflowState,
    progressMetrics: progressContext.progressMetrics,
    scheduledRetry: progressContext.scheduledRetry,
  });
  return Object.freeze({
    ...progressContext,
    inFlightDescriptor,
    learnerNeverPromotable: blockerReasons.includes(
      PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE,
    ),
    missingFollowupOperation,
    observationDeferred: isPriorityRecoveryObservationDeferred({
      completionState: progressContext.completionState,
      visibilityState: progressContext.visibilityState,
      authoritativeOperationReadDeferred:
        options.authoritativeOperationReadDeferred === true,
    }),
    operationNoTransitions: blockerReasons.includes(
      PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
    ),
    priorityOperationSerialWait,
    recoveryEligibleExcluded: blockerReasons.includes(
      PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
    ),
    spreadSatisfiedInFlight:
      progressContext.completionState ===
        PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
    terminalOrBlocked:
      progressContext.workflowState === PRIORITY_RECOVERY_WORKFLOW_STATE.TERMINAL ||
      progressContext.completionState === PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
    transitionDeferredSchedulingActuation,
  });
}

export {
  PRIORITY_RECOVERY_ACTUATION_DECISION_TABLE,
  buildPriorityRecoveryActuationContext,
  buildPriorityRecoveryActuationContract,
  buildPriorityRecoveryBlockedDescriptor,
  buildPriorityRecoveryContractInputContext,
  buildPriorityRecoveryPendingDescriptor,
  buildPriorityRecoveryProgressContext,
  buildPriorityRecoveryProgressDecisionDescriptor,
  buildPriorityRecoveryProgressDecisionEvidence,
  buildPriorityRecoveryProgressOutcome,
  buildPriorityRecoveryProgressShape,
  buildPriorityRecoveryReadyDescriptor,
  buildPriorityRecoveryRetryScheduledDescriptor,
  resolvePriorityRecoveryActuationDecision,
  resolvePriorityRecoveryActuationOption,
  resolvePriorityRecoveryConditionsOption,
  resolvePriorityRecoveryContractBlockerReasons,
  resolvePriorityRecoveryContractCompletionState,
  resolvePriorityRecoveryContractLastProgressAtMs,
  resolvePriorityRecoveryContractNowMs,
  resolvePriorityRecoveryContractRetryAfterMs,
  resolvePriorityRecoveryContractVisibilityState,
  resolvePriorityRecoveryContractWorkflowState,
  resolvePriorityRecoveryInFlightProgressDescriptor,
  resolvePriorityRecoveryLatestOperationContextOption,
  resolvePriorityRecoveryObjectOption,
  resolvePriorityRecoveryOperationContextsOption,
  resolvePriorityRecoveryProgressLastProgressAtMs,
};
