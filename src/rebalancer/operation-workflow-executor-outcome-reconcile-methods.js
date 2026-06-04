import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';

const {
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
  EXECUTOR_STEP_UPDATE_RECONCILE_WORKFLOW_STEPS,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_TRANSITION_REASON,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  TYPEOF,
  WORKFLOW_STEP,
  isRetryableControlPlaneError,
} = SHARED;

const EXECUTOR_FAILURE_RECONCILE_STATE = Object.freeze({
  DEFER_RETRY: 'defer_retry',
  FAIL_OPERATION: 'fail_operation',
});

const EXECUTOR_FAILURE_RECONCILE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: EXECUTOR_FAILURE_RECONCILE_STATE.DEFER_RETRY,
    matches: (evidence) =>
      evidence.retryableControlPlaneFailure === true &&
      evidence.criticalSystemPartition === true &&
      evidence.dispatchRetryableWorkflowStep === true,
  }),
  Object.freeze({
    state: EXECUTOR_FAILURE_RECONCILE_STATE.FAIL_OPERATION,
    matches: () => true,
  }),
]);

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

const EXECUTOR_OUTCOME_REMOTE_OWNER_WAKE_TYPES = Object.freeze(
  new Set([
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
  ]),
);

const EXECUTOR_OUTCOME_EMPTY_VISIBILITY_RETRY_WINDOW_MS =
  SHARED.TIME_MS.MINUTE;

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

const EXECUTOR_OUTCOME_RETRY_WORKFLOW_STEP_RANK = Object.freeze(new Map([
  [WORKFLOW_STEP.PENDING, NUM.ONE],
  [WORKFLOW_STEP.SENDING, NUM.TWO],
  [WORKFLOW_STEP.CREATING, NUM.THREE],
  [WORKFLOW_STEP.SYNCING, NUM.FOUR],
  [WORKFLOW_STEP.ACTIVE, NUM.FIVE],
  [WORKFLOW_STEP.STOPPING, NUM.SIX],
  [WORKFLOW_STEP.REMOVED, NUM.SEVEN],
  [WORKFLOW_STEP.FAILED, NUM.SEVEN],
]));

const EXECUTOR_OUTCOME_VISIBILITY_RETRY_ERROR_MESSAGE =
  'Executor outcome operation visibility deferred';

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

class OperationWorkflowExecutorOutcomeReconcileMethods {
  handleExecutorOutcome(outcome) {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const operationId = outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    if (!operationId) {
      return;
    }
    this.retainExecutorOutcomeRetryPayload(operationId, outcome);

    const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);

    this.operationWorkflowRunExclusive(singleFlightKey, () =>
      this.reconcileExecutorOutcome(outcome),
    ).catch((error) => {
      if (
        this.deferTransitionRetry(operationId, error, {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
          workflowStep: outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP] ||
            EXECUTOR_OUTCOME_VISIBILITY_ABSENCE.WORKFLOW_STEP,
          partitionId: EXECUTOR_OUTCOME_VISIBILITY_ABSENCE.PARTITION_ID,
        })
      ) {
        return;
      }
      this.logger.error(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_TRANSITION_FAILED,
        {
          operationId,
          outcomeType: outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE],
          error: error.message,
        },
      );
    });
  }

  buildExecutorFailureOutcomeErrorLike(
    outcome,
    fallbackMessage,
  ) {
    const errorMessage =
      outcome?.[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE] || fallbackMessage;
    const error = new Error(errorMessage);
    const errorCode = outcome?.[EXECUTOR_OUTCOME_FIELD.ERROR_CODE];
    if (typeof errorCode === TYPEOF.STRING && errorCode.length > NUM.ZERO) {
      error.code = errorCode;
      error.errorCode = errorCode;
    }
    const retryAfterMs = outcome?.[EXECUTOR_OUTCOME_FIELD.RETRY_AFTER_MS];
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
      error.retryAfterMs = Math.floor(retryAfterMs);
    }
    if (outcome?.[EXECUTOR_OUTCOME_FIELD.DEFER_RETRY] === true) {
      error.deferRetry = true;
    }
    return error;
  }

  buildExecutorFailureReconcileEvidence(operation, errorLike) {
    return Object.freeze({
      criticalSystemPartition:
        this.isCriticalSystemPartition(operation?.partitionId || null),
      dispatchRetryableWorkflowStep:
        this.isDispatchRetryableWorkflowStep(operation),
      retryableControlPlaneFailure:
        isRetryableControlPlaneError(errorLike),
    });
  }

  resolveExecutorFailureReconcileState(evidence) {
    return (
      EXECUTOR_FAILURE_RECONCILE_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      EXECUTOR_FAILURE_RECONCILE_STATE.FAIL_OPERATION
    );
  }

  shouldWakeRemoteOwnerForExecutorOutcome(operation, outcome) {
    const outcomeType = outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE];
    return (
      EXECUTOR_OUTCOME_REMOTE_OWNER_WAKE_TYPES.has(outcomeType) &&
      this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) === true &&
      this.isDispatchRetryableWorkflowStep(operation) === true
    );
  }

  isFreshExecutorOutcomeForEmptyVisibility(outcome) {
    const timestamp = outcome?.[EXECUTOR_OUTCOME_FIELD.TIMESTAMP];
    if (!Number.isFinite(timestamp)) {
      return false;
    }
    const outcomeAgeMs = Date.now() - timestamp;
    return (
      outcomeAgeMs >= NUM.ZERO &&
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
        typeof replicaId === TYPEOF.STRING && replicaId.length > NUM.ZERO,
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

  cloneExecutorOutcomeRetryPayload(outcome) {
    return Object.freeze({...outcome});
  }

  getExecutorOutcomeRetryWorkflowStepRank(outcome) {
    return (
      EXECUTOR_OUTCOME_RETRY_WORKFLOW_STEP_RANK.get(
        outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP],
      ) ||
      NUM.NEGATIVE_ONE
    );
  }

  selectExecutorOutcomeRetryPayload(existingOutcome, candidateOutcome) {
    if (!existingOutcome) {
      return candidateOutcome;
    }
    const existingRank =
      this.getExecutorOutcomeRetryWorkflowStepRank(existingOutcome);
    const candidateRank =
      this.getExecutorOutcomeRetryWorkflowStepRank(candidateOutcome);
    return candidateRank >= existingRank ? candidateOutcome : existingOutcome;
  }

  retainExecutorOutcomeRetryPayload(operationId, outcome) {
    const retryPayload = this.cloneExecutorOutcomeRetryPayload(outcome);
    const selectedPayload = this.selectExecutorOutcomeRetryPayload(
      this.executorOutcomeRetryPayloadByOperationId.get(operationId),
      retryPayload,
    );
    this.executorOutcomeRetryPayloadByOperationId.set(
      operationId,
      selectedPayload,
    );
    return selectedPayload;
  }

  clearExecutorOutcomeRetry(operationId) {
    const timerHandle =
      this.executorOutcomeRetryTimerByOperationId.get(operationId);
    if (timerHandle) {
      this.clearTimeoutFn(timerHandle);
      this.executorOutcomeRetryTimerByOperationId.delete(operationId);
    }
    this.executorOutcomeRetryPayloadByOperationId.delete(operationId);
  }

  buildExecutorOutcomeVisibilityRetryError(visibilityObservation) {
    const retryAfterMs = Number.isFinite(visibilityObservation?.retryAfterMs) &&
      visibilityObservation.retryAfterMs > NUM.ZERO ?
      Math.floor(visibilityObservation.retryAfterMs) :
      OBSERVED_PROGRESS_RETRY_DELAY_MS;
    const deferredOutcome =
      visibilityObservation?.deferredOutcome &&
      typeof visibilityObservation.deferredOutcome === TYPEOF.OBJECT ?
        visibilityObservation.deferredOutcome :
        EXECUTOR_OUTCOME_VISIBILITY_ABSENCE.DEFERRED_OUTCOME;
    const error = new Error(EXECUTOR_OUTCOME_VISIBILITY_RETRY_ERROR_MESSAGE);
    error.code = OPERATION_WORKFLOW_OWNER_LITERAL
      .CONTROL_PLANE_PRESSURE_DEGRADED;
    error.errorCode = OPERATION_WORKFLOW_OWNER_LITERAL
      .CONTROL_PLANE_PRESSURE_DEGRADED;
    error.deferRetry = true;
    error.retryAfterMs = retryAfterMs;
    error.deferredOutcome = deferredOutcome;
    return error;
  }

  scheduleExecutorOutcomeRetry(outcome, visibilityObservation) {
    const operationId = outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    if (!operationId) {
      return false;
    }
    const selectedPayload = this.retainExecutorOutcomeRetryPayload(
      operationId,
      outcome,
    );
    if (this.executorOutcomeRetryTimerByOperationId.has(operationId)) {
      return true;
    }
    const retryError =
      this.buildExecutorOutcomeVisibilityRetryError(visibilityObservation);
    const delayMs = retryError.retryAfterMs;
    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED,
      {
        operationId,
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
        workflowStep:
          selectedPayload[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP] ||
          EXECUTOR_OUTCOME_VISIBILITY_ABSENCE.WORKFLOW_STEP,
        partitionId: EXECUTOR_OUTCOME_VISIBILITY_ABSENCE.PARTITION_ID,
        delayMs,
        errorMessage: retryError.message,
      },
    );
    const timerHandle = this.setTimeoutFn(() => {
      this.executorOutcomeRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
        return;
      }
      if (this.isOperationOwnerLaneHeld(operationId)) {
        const retainedRetryOutcome =
          this.executorOutcomeRetryPayloadByOperationId.get(operationId);
        if (retainedRetryOutcome) {
          this.scheduleExecutorOutcomeRetry(
            retainedRetryOutcome,
            visibilityObservation,
          );
        }
        return;
      }
      const retryOutcome =
        this.executorOutcomeRetryPayloadByOperationId.get(operationId);
      this.executorOutcomeRetryPayloadByOperationId.delete(operationId);
      if (!retryOutcome) {
        return;
      }
      return this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        () => this.reconcileExecutorOutcome(retryOutcome),
      ).catch((error) => {
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_TRANSITION_FAILED,
          {
            operationId,
            outcomeType:
              retryOutcome[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE],
            error: error.message,
          },
        );
      });
    }, delayMs);
    this.executorOutcomeRetryTimerByOperationId.set(operationId, timerHandle);
    return true;
  }

  async reconcileExecutorOutcome(outcome) {
    const operationId = outcome[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    const outcomeType = outcome[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE];
    const workflowStep = outcome[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP];
    const errorMessage = outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE];

    this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_RECEIVED, {
      operationId,
      outcomeType,
      workflowStep,
    });

    const visibilityObservation =
      await this.repository.getOperationByIdVisibilityObservation(
        operationId,
        {
          requireOwnerRpcRead: false,
          allowPriorityRecoveryDeferredVisibility: true,
        },
      );
    const visibilityAction =
      this.resolveExecutorOutcomeOperationVisibilityAction(
        visibilityObservation,
        outcome,
      );
    if (
      visibilityAction ===
      EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION.RETRY_OUTCOME
    ) {
      return this.scheduleExecutorOutcomeRetry(
        outcome,
        visibilityObservation,
      );
    }

    const operation = visibilityObservation?.operation &&
      typeof visibilityObservation.operation === TYPEOF.OBJECT ?
      visibilityObservation.operation :
      EXECUTOR_OUTCOME_VISIBILITY_ABSENCE.OPERATION;
    if (
      visibilityAction ===
        EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION.SKIP_OUTCOME ||
      operation === EXECUTOR_OUTCOME_VISIBILITY_ABSENCE.OPERATION
    ) {
      this.clearExecutorOutcomeRetry(operationId);
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_FOUND,
        {operationId, outcomeType},
      );
      return false;
    }
    this.clearExecutorOutcomeRetry(operationId);

    if (this.repository.isOperationTerminal(operation)) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_TERMINAL,
        {
          operationId,
          outcomeType,
          step: operation.workflowStep,
        },
      );
      return false;
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      if (this.shouldWakeRemoteOwnerForExecutorOutcome(operation, outcome)) {
        const woken = await this.wakeCoordinatorCreatedRemoteOwner(operation);
        this.logger.debug(
          REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_LOCAL,
          {
            operationId,
            outcomeType,
            remoteOwnerWake: woken,
          },
        );
        return woken;
      }
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_LOCAL,
        {operationId, outcomeType},
      );
      return false;
    }

    const mapping = EXECUTOR_OUTCOME_ACTION_MAP[outcomeType];
    if (!mapping) {
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION, {
        operationId,
        outcomeType,
      });
      return false;
    }

    const shouldResumeReplaceActivePhase =
      mapping.action === EXECUTOR_OUTCOME_ACTION.COMPLETE &&
      workflowStep === WORKFLOW_STEP.ACTIVE &&
      operation.type === OperationType.REPLACE;

    if (mapping.action === EXECUTOR_OUTCOME_ACTION.UPDATE_STEP) {
      if (!this.isExecutorOutcomeStepBehindOperation(operation, workflowStep)) {
        await this.updateStep(
          operation,
          workflowStep,
          OPERATION_TRANSITION_REASON.EXECUTOR_OUTCOME,
        );
      }
      await this.reconcileExecutorStepUpdateOutcome(
        operation,
        outcomeType,
        workflowStep,
      );
    } else if (shouldResumeReplaceActivePhase) {
      await this.reconcileReplaceActualActive(operation);
    } else if (mapping.action === EXECUTOR_OUTCOME_ACTION.COMPLETE) {
      await this.completeOperation(operation);
    } else if (mapping.action === EXECUTOR_OUTCOME_ACTION.FAIL) {
      const errorLike = this.buildExecutorFailureOutcomeErrorLike(
        outcome,
        errorMessage || outcomeType,
      );
      const failureState = this.resolveExecutorFailureReconcileState(
        this.buildExecutorFailureReconcileEvidence(operation, errorLike),
      );
      if (
        failureState === EXECUTOR_FAILURE_RECONCILE_STATE.DEFER_RETRY &&
        this.deferTransitionRetry(operationId, errorLike, {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
          workflowStep: operation?.workflowStep || null,
          partitionId: operation?.partitionId || null,
          updatedAt: operation?.updatedAt,
          createdAt: operation?.createdAt,
          operationSnapshot: operation,
        })
      ) {
        return true;
      }
      await this.failOperation(
        operation,
        errorLike?.message || errorMessage || outcomeType,
      );
    } else {
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION, {
        operationId,
        outcomeType,
        action: mapping.action,
      });
      return false;
    }

    this.emitter.emit(REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED, {
      operationId,
      outcomeType,
      action: mapping.action,
    });

    return true;
  }

  isExecutorOutcomeStepBehindOperation(operation, workflowStep) {
    const operationStepRank = this.getOperationWorkflowStepRank(operation);
    const outcomeStepRank = this.getOperationWorkflowStepRank({
      ...operation,
      workflowStep,
    });
    return (
      operationStepRank !== NUM.NEGATIVE_ONE &&
      outcomeStepRank !== NUM.NEGATIVE_ONE &&
      outcomeStepRank < operationStepRank
    );
  }

  async reconcileExecutorStepUpdateOutcome(
    operation,
    outcomeType,
    workflowStep,
  ) {
    if (
      outcomeType !== EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING ||
      workflowStep !== WORKFLOW_STEP.SYNCING ||
      !EXECUTOR_STEP_UPDATE_RECONCILE_WORKFLOW_STEPS.has(
        operation?.workflowStep,
      )
    ) {
      return false;
    }
    return this.reconcileOperationLifecycle(operation, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
    });
  }
}

function applyOperationWorkflowExecutorOutcomeReconcileMethods(targetClass) {
  const sourcePrototype =
    OperationWorkflowExecutorOutcomeReconcileMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === 'constructor') {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyOperationWorkflowExecutorOutcomeReconcileMethods};
