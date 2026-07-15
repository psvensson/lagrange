import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from
  './operation-workflow-recovery-reconcile-shared.js';

const {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_WORKFLOW_OWNER_LITERAL,
} = SHARED;

const EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE = Object.freeze({
  PRESENT: 'present',
  DEFERRED: 'deferred',
  EMPTY: 'empty',
});

const EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION = Object.freeze({
  USE_OPERATION: 'use_operation',
  RETRY_OUTCOME: 'retry_outcome',
  SKIP_OUTCOME: 'skip_outcome',
});

const EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE.PRESENT,
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION.USE_OPERATION,
    ],
    [
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE.DEFERRED,
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION.RETRY_OUTCOME,
    ],
    [
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE.EMPTY,
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION.SKIP_OUTCOME,
    ],
  ]),
);

const EXECUTOR_OUTCOME_EMPTY_VISIBILITY_RETRYABLE_TYPES = Object.freeze(
  new Set([
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
  ]),
);

const EXECUTOR_OUTCOME_EMPTY_VISIBILITY_RETRY_WINDOW_MS =
  SHARED.TIME_MS.MINUTE;

const EXECUTOR_OUTCOME_RETRY_CONTEXT_FIELD = Object.freeze({
  COMPLETION_STATE: 'completionState',
  REASON_CODE: 'reasonCode',
});

const PROTOTYPE_CONSTRUCTOR_METHOD = 'constructor';

const EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE.PRESENT,
    matches: (evidence) => evidence.operationAvailable === true,
  }),
  Object.freeze({
    state: EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE.DEFERRED,
    matches: (evidence) => evidence.visibilityDeferred === true,
  }),
  Object.freeze({
    state: EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE.DEFERRED,
    matches: (evidence) =>
      evidence.emptyVisibility === true &&
      evidence.emptyVisibilityReplicaOutcome === true &&
      evidence.emptyVisibilityRetryableOutcome === true &&
      evidence.freshEmptyVisibilityOutcome === true,
  }),
  Object.freeze({
    state: EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE.EMPTY,
    matches: () => true,
  }),
]);

const EXECUTOR_OUTCOME_VISIBILITY_ABSENCE = Object.freeze({
  DEFERRED_OUTCOME: Object.freeze({
    state: 'executor_outcome_deferred_outcome_unavailable',
  }),
  OPERATION: Object.freeze({
    state: 'executor_outcome_operation_unavailable',
  }),
  PARTITION_ID: 'executor_outcome_partition_unavailable',
  WORKFLOW_STEP: 'executor_outcome_workflow_step_unavailable',
});

class OperationWorkflowExecutorOutcomeVisibility {
  isFreshExecutorOutcomeForEmptyVisibility(outcome) {
    const timestamp = outcome?.[EXECUTOR_OUTCOME_FIELD.TIMESTAMP];
    if (!Number.isFinite(timestamp)) {
      return false;
    }
    const outcomeAgeMs = Date.now() - timestamp;
    return (
      outcomeAgeMs >= 0 &&
      outcomeAgeMs <= EXECUTOR_OUTCOME_EMPTY_VISIBILITY_RETRY_WINDOW_MS
    );
  }

  buildExecutorOutcomeOperationVisibilityEvidence(
    visibilityObservation,
    outcome,
  ) {
    const replicaId = outcome?.[EXECUTOR_OUTCOME_FIELD.REPLICA_ID];
    return Object.freeze({
      emptyVisibility:
        visibilityObservation?.state ===
        INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
      emptyVisibilityReplicaOutcome:
        typeof replicaId === 'string' && replicaId.length > 0,
      emptyVisibilityRetryableOutcome:
        EXECUTOR_OUTCOME_EMPTY_VISIBILITY_RETRYABLE_TYPES.has(
          outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE],
        ),
      freshEmptyVisibilityOutcome:
        this.isFreshExecutorOutcomeForEmptyVisibility(outcome),
      operationAvailable: Boolean(visibilityObservation?.operation),
      visibilityDeferred:
        visibilityObservation?.state ===
          INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED ||
        Boolean(visibilityObservation?.deferredOutcome),
    });
  }

  getExecutorOutcomeStringField(source, field) {
    const value = source?.[field];
    return typeof value === 'string' && value.length > 0 ?
      value :
      null;
  }

  buildExecutorOutcomeRetryContext(outcome, visibilityObservation = null) {
    const operation = visibilityObservation?.operation &&
      typeof visibilityObservation.operation === 'object' ?
      visibilityObservation.operation :
      null;
    const deferredOutcome =
      visibilityObservation?.deferredOutcome &&
      typeof visibilityObservation.deferredOutcome === 'object' ?
        visibilityObservation.deferredOutcome :
        null;
    const partitionId =
      this.getExecutorOutcomeStringField(operation, 'partitionId') ||
      this.getExecutorOutcomeStringField(
        outcome,
        EXECUTOR_OUTCOME_FIELD.PARTITION_ID,
      ) ||
      this.getExecutorOutcomeStringField(deferredOutcome, 'partitionId') ||
      EXECUTOR_OUTCOME_VISIBILITY_ABSENCE.PARTITION_ID;
    const workflowStep =
      this.getExecutorOutcomeStringField(operation, 'workflowStep') ||
      this.getExecutorOutcomeStringField(
        outcome,
        EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP,
      ) ||
      EXECUTOR_OUTCOME_VISIBILITY_ABSENCE.WORKFLOW_STEP;
    return Object.freeze({
      boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
      workflowStep,
      partitionId,
      operationSnapshot: operation,
      completionState:
        this.getExecutorOutcomeStringField(
          deferredOutcome,
          EXECUTOR_OUTCOME_RETRY_CONTEXT_FIELD.COMPLETION_STATE,
        ),
      reasonCode:
        this.getExecutorOutcomeStringField(
          deferredOutcome,
          EXECUTOR_OUTCOME_RETRY_CONTEXT_FIELD.REASON_CODE,
        ),
    });
  }

  buildExecutorOutcomeRetryVisibilityObservation(
    error,
    priorVisibilityObservation = null,
  ) {
    const retryAfterMs = Number.isFinite(error?.retryAfterMs) &&
      error.retryAfterMs > 0 ?
      Math.floor(error.retryAfterMs) :
      OBSERVED_PROGRESS_RETRY_DELAY_MS;
    const priorDeferredOutcome =
      priorVisibilityObservation?.deferredOutcome &&
      typeof priorVisibilityObservation.deferredOutcome === 'object' ?
        priorVisibilityObservation.deferredOutcome :
        null;
    const deferredOutcome = {
      ...(priorDeferredOutcome || {}),
      retryAfterMs,
    };
    if (
      !deferredOutcome.completionState &&
      typeof error?.completionState === 'string'
    ) {
      deferredOutcome.completionState = error.completionState;
    }
    if (
      !deferredOutcome.reasonCode &&
      typeof error?.reasonCode === 'string'
    ) {
      deferredOutcome.reasonCode = error.reasonCode;
    }
    return Object.freeze({
      state: INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED,
      operation:
        priorVisibilityObservation?.operation &&
        typeof priorVisibilityObservation.operation === 'object' ?
          priorVisibilityObservation.operation :
          null,
      deferredOutcome,
      retryAfterMs,
    });
  }

  resolveExecutorOutcomeOperationVisibilityAction(
    visibilityObservation,
    outcome,
  ) {
    const evidence =
      this.buildExecutorOutcomeOperationVisibilityEvidence(
        visibilityObservation,
        outcome,
      );
    const state =
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE.EMPTY;
    return (
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION_BY_STATE.get(state) ||
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION.SKIP_OUTCOME
    );
  }
}

function applyOperationWorkflowExecutorOutcomeVisibility(targetClass) {
  const sourcePrototype = OperationWorkflowExecutorOutcomeVisibility.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === PROTOTYPE_CONSTRUCTOR_METHOD) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {
  EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION,
  EXECUTOR_OUTCOME_VISIBILITY_ABSENCE,
  applyOperationWorkflowExecutorOutcomeVisibility,
};
