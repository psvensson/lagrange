// Executor failure evidence hands retained REMOVE debt to the existing operation retry owner.
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';
const {EXECUTOR_OUTCOME_FIELD, EXECUTOR_OUTCOME_TYPE, OperationType,
  classifySystemPartition, isRetryableControlPlaneError} = SHARED;

const EXECUTOR_FAILURE_RECONCILE_STATE = Object.freeze({
  DEFER_RETRY: 'defer_retry',
  FAIL_OPERATION: 'fail_operation',
});

const EXECUTOR_FAILURE_RECONCILE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: EXECUTOR_FAILURE_RECONCILE_STATE.DEFER_RETRY,
    matches: (evidence) =>
      evidence.retryableControlPlaneFailure === true &&
      (evidence.criticalSystemPartition === true || evidence.retainedRemovalDebt === true) &&
      evidence.dispatchRetryableWorkflowStep === true,
  }),
  Object.freeze({
    state: EXECUTOR_FAILURE_RECONCILE_STATE.FAIL_OPERATION,
    matches: () => true,
  }),
]);

function buildExecutorFailureOutcomeErrorLike(
  outcome,
  fallbackMessage,
) {
  const errorMessage =
      outcome?.[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE] || fallbackMessage;
  const error = new Error(errorMessage);
  const errorCode = outcome?.[EXECUTOR_OUTCOME_FIELD.ERROR_CODE];
  if (typeof errorCode === 'string' && errorCode.length > 0) {
    error.code = errorCode;
    error.errorCode = errorCode;
  }
  const retryAfterMs = outcome?.[EXECUTOR_OUTCOME_FIELD.RETRY_AFTER_MS];
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    error.retryAfterMs = Math.floor(retryAfterMs);
  }
  if (outcome?.[EXECUTOR_OUTCOME_FIELD.DEFER_RETRY] === true) {
    error.deferRetry = true;
  }
  return error;
}

function buildExecutorFailureReconcileEvidence(owner, operation, errorLike, outcome) {
  return Object.freeze({
    retainedRemovalDebt:
      outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE] ===
        EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED &&
        errorLike.deferRetry === true &&
        (operation?.type === OperationType.REMOVE ||
          owner.repository.isReplaceRemoveDispatchPhase(operation)),
    criticalSystemPartition:
        classifySystemPartition({
          partitionId: operation?.partitionId || null,
        }).systemTable ||
        (operation?.entityType || operation?.entity_type) ===
          SHARED.UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    dispatchRetryableWorkflowStep:
        owner.isDispatchRetryableWorkflowStep(operation),
    retryableControlPlaneFailure:
        isRetryableControlPlaneError(errorLike),
  });
}

function resolveExecutorFailureReconcileState(evidence) {
  return (
    EXECUTOR_FAILURE_RECONCILE_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
      EXECUTOR_FAILURE_RECONCILE_STATE.FAIL_OPERATION
  );
}

export {EXECUTOR_FAILURE_RECONCILE_STATE, buildExecutorFailureOutcomeErrorLike,
  buildExecutorFailureReconcileEvidence, resolveExecutorFailureReconcileState};
