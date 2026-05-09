import {OperationWorkflowOwnerSegment7Stage2} from './operation-workflow-owner-segment-7-stage-2.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-owner-segment-7-stage-shared.js';

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
  EXECUTOR_STEP_UPDATE_RECONCILE_WORKFLOW_STEPS,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_TRANSITION_REASON,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OPERATION_TYPES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_TABLE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_REPLACE_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_SOURCE_STATES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_TARGET_OBSERVED_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE_BY_SOURCE_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaStatus,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  TYPEOF,
  WORKFLOW_STEP,
  isRetryableControlPlaneError,
  isPriorityControlPlanePartition,
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

class OperationWorkflowOwnerSegment7Stage3 extends OperationWorkflowOwnerSegment7Stage2 {
  async checkTimeouts() {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const now = Date.now();
    if (
      this.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO &&
      now - this.lastEmptyIncompleteOperationQueryAtMs <
        this.incompleteOperationQueryEmptyBackoffMs
    ) {
      return;
    }

    const canUseCacheObservationBoundary =
      this.repository.hasReplicaOperationCacheObservationBoundary();
    const cachedIncompleteOps = canUseCacheObservationBoundary ?
      await this.repository.queryCachedIncompleteOperations() :
      [];
    if (cachedIncompleteOps.length > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
    } else if (
      canUseCacheObservationBoundary &&
      this.shouldDelayEmptyIncompleteOperationQuery(now)
    ) {
      return;
    }

    const incompleteOperationObservation =
      await this.repository.getIncompleteOperationVisibilityObservation({
        cachedOperations: cachedIncompleteOps,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
      });
    const incompleteOps = Array.isArray(
      incompleteOperationObservation?.operations,
    ) ?
      incompleteOperationObservation.operations :
      [];
    if (
      incompleteOperationObservation.state ===
      INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY
    ) {
      this.lastEmptyIncompleteOperationQueryAtMs = now;
      return;
    }
    this.clearEmptyIncompleteOperationQueryDelay();
    if (
      incompleteOperationObservation.state ===
      INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    ) {
      return;
    }

    const timeoutReconcileTasks = [];

    for (const operation of incompleteOps) {
      if (this.repository.isOperationTerminal(operation)) {
        continue;
      }
      const operationDrainSnapshot =
        await this.buildPriorityRecoveryOperationDrainSnapshot(operation);
      if (
        await this.wakePriorityRecoveryRemoteOwnerFromDrainSnapshot(
          operation,
          operationDrainSnapshot,
        )
      ) {
        continue;
      }
      if (
        !this.shouldEnterOperationLifecycleFromDrainSnapshot(
          operationDrainSnapshot,
        )
      ) {
        continue;
      }

      const singleFlightKey = this.getOperationOwnerSingleFlightKey(
        operation.operationId,
      );

      const reconcileTask = this.operationWorkflowRunExclusive(
        singleFlightKey,
        async () => {
          const visibilityObservation =
            await this.repository.getOperationByIdVisibilityObservation(
              operation.operationId,
              {
                requireOwnerRpcRead: false,
                allowPriorityRecoveryDeferredVisibility: true,
              },
            );
          const timeoutOperation = this.selectTimeoutReconcileOperation(
            visibilityObservation,
            operation,
          );
          if (!timeoutOperation) {
            return;
          }
          if (this.repository.isOperationTerminal(timeoutOperation)) {
            return;
          }
          const timeoutOperationDrainSnapshot =
            await this.buildPriorityRecoveryOperationDrainSnapshot(
              timeoutOperation,
            );
          if (
            await this.wakePriorityRecoveryRemoteOwnerFromDrainSnapshot(
              timeoutOperation,
              timeoutOperationDrainSnapshot,
            )
          ) {
            return;
          }
          if (
            !this.shouldEnterOperationLifecycleFromDrainSnapshot(
              timeoutOperationDrainSnapshot,
            )
          ) {
            return;
          }

          await this.reconcileTimeoutOperation(timeoutOperation, Date.now());
        },
      ).catch((error) => {
        if (
          this.deferTransitionRetry(operation.operationId, error, {
            boundary: 'timeout_reconcile',
            workflowStep: operation?.workflowStep || null,
            partitionId: operation?.partitionId || null,
            updatedAt: operation?.updatedAt,
            createdAt: operation?.createdAt,
          })
        ) {
          return;
        }
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
          {
            operationId: operation.operationId,
            error: error.message,
            nodeId: this.nodeId,
          },
        );
      });
      timeoutReconcileTasks.push(reconcileTask);
    }

    if (timeoutReconcileTasks.length > NUM.ZERO) {
      await Promise.all(timeoutReconcileTasks);
    }

    // Periodic reservation reconciliation (Req 4.4)
    await this.reconcileReservations().catch((error) => {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
        {error: error.message},
      );
    });
  }

  handleExecutorOutcome(outcome) {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const operationId = outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    if (!operationId) {
      return;
    }

    const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);

    this.operationWorkflowRunExclusive(singleFlightKey, () =>
      this.reconcileExecutorOutcome(outcome),
    ).catch((error) => {
      if (
        this.deferTransitionRetry(operationId, error, {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
          workflowStep: outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP] || null,
          partitionId: null,
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

  buildExecutorOutcomeOperationVisibilityEvidence(visibilityObservation) {
    return Object.freeze({
      operationAvailable: Boolean(visibilityObservation?.operation),
      visibilityDeferred:
        visibilityObservation?.state ===
          INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED ||
        Boolean(visibilityObservation?.deferredOutcome),
    });
  }

  resolveExecutorOutcomeOperationVisibilityAction(visibilityObservation) {
    const evidence =
      this.buildExecutorOutcomeOperationVisibilityEvidence(
        visibilityObservation,
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
    const error = new Error(EXECUTOR_OUTCOME_VISIBILITY_RETRY_ERROR_MESSAGE);
    error.code = OPERATION_WORKFLOW_OWNER_LITERAL
      .CONTROL_PLANE_PRESSURE_DEGRADED;
    error.errorCode = OPERATION_WORKFLOW_OWNER_LITERAL
      .CONTROL_PLANE_PRESSURE_DEGRADED;
    error.deferRetry = true;
    error.retryAfterMs = retryAfterMs;
    error.deferredOutcome = visibilityObservation?.deferredOutcome || null;
    return error;
  }

  scheduleExecutorOutcomeRetry(outcome, visibilityObservation) {
    const operationId = outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    if (!operationId) {
      return false;
    }
    const retryPayload = this.cloneExecutorOutcomeRetryPayload(outcome);
    const selectedPayload = this.selectExecutorOutcomeRetryPayload(
      this.executorOutcomeRetryPayloadByOperationId.get(operationId),
      retryPayload,
    );
    this.executorOutcomeRetryPayloadByOperationId.set(
      operationId,
      selectedPayload,
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
          selectedPayload[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP] || null,
        partitionId: null,
        delayMs,
        errorMessage: retryError.message,
      },
    );
    const timerHandle = this.setTimeoutFn(() => {
      this.executorOutcomeRetryTimerByOperationId.delete(operationId);
      const retryOutcome =
        this.executorOutcomeRetryPayloadByOperationId.get(operationId);
      this.executorOutcomeRetryPayloadByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized || !retryOutcome) {
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

    const operation = visibilityObservation?.operation || null;
    if (
      visibilityAction ===
        EXECUTOR_OUTCOME_OPERATION_VISIBILITY_ACTION.SKIP_OUTCOME ||
      !operation
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

  isPreSyncStep(step) {
    return [
      WORKFLOW_STEP.PENDING,
      WORKFLOW_STEP.SENDING,
      WORKFLOW_STEP.CREATING,
    ].includes(step);
  }

  resolveOperationLifecycleAction(
    operation,
    cause = OPERATION_WORKFLOW_OWNER_LITERAL.PROGRESS,
  ) {
    if (cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY) {
      if (this.isPreSyncStep(operation.workflowStep)) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY;
      }
      if (operation.workflowStep === WORKFLOW_STEP.STOPPING) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY;
      }
    }

    if (
      operation.type === OperationType.REPLACE &&
      operation.workflowStep === WORKFLOW_STEP.ACTIVE
    ) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE;
    }

    if (this.isRemoveInitialDispatchPhase(operation)) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH;
    }

    if (
      operation.workflowStep === WORKFLOW_STEP.STOPPING &&
      (operation.type === OperationType.REMOVE ||
        operation.type === OperationType.REPLACE)
    ) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING;
    }

    if (
      operation.workflowStep === WORKFLOW_STEP.PENDING ||
      operation.workflowStep === WORKFLOW_STEP.SENDING ||
      operation.workflowStep === WORKFLOW_STEP.CREATING ||
      operation.workflowStep === WORKFLOW_STEP.SYNCING
    ) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS;
    }

    return OPERATION_LIFECYCLE_ACTION.NOOP;
  }

  isPriorityRecoveryOperationDrainCandidate(operation) {
    if (
      !operation ||
      !PRIORITY_RECOVERY_OPERATION_DRAIN_OPERATION_TYPES.has(
        operation.type,
      ) ||
      this.repository.isOperationTerminal(operation)
    ) {
      return false;
    }
    return (
      isPriorityControlPlanePartition({partitionId: operation.partitionId}) &&
      PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS.has(
        operation.workflowStep,
      )
    );
  }

  resolvePriorityRecoveryOperationDrainState(
    completion,
    sourceSnapshot,
    releaseEvidence = null,
  ) {
    if (!completion || typeof completion !== TYPEOF.OBJECT) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE;
    }
    if (
      !PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES.has(
        completion.state,
      )
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.IN_FLIGHT;
    }
    const sourceState =
      sourceSnapshot?.state ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED;
    const releaseDecision =
      this.decidePriorityRecoveryOperationDrainRelease(releaseEvidence);
    if (
      releaseDecision.state ===
      PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_STATE.RELEASE
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE
        .OWNER_UNAVAILABLE_RELEASED;
    }
    return (
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE_BY_SOURCE_STATE.get(
        sourceState,
      ) ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE
    );
  }

  decidePriorityRecoveryOperationDrainRelease(evidence) {
    const decision =
      PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_TABLE.find((entry) =>
        entry.matches(evidence || Object.freeze({})),
      );
    return Object.freeze({
      state:
        decision?.state ||
        PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_STATE.HOLD,
    });
  }

  isPriorityRecoveryDrainOwnerUnavailable(ownerNodeId, operation) {
    if (
      typeof ownerNodeId !== TYPEOF.STRING ||
      ownerNodeId.length === NUM.ZERO ||
      ownerNodeId === this.nodeId
    ) {
      return false;
    }
    try {
      return !this.isNodeReadyForRouting(ownerNodeId, {
        partitionId: operation?.partitionId || null,
        decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
        participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
      });
    } catch {
      return false;
    }
  }

  isPriorityRecoveryOperationDrainReleaseEligibleReplace(operation) {
    if (operation?.type !== OperationType.REPLACE) {
      return false;
    }
    if (
      PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_REPLACE_WORKFLOW_STEPS.has(
        operation?.workflowStep,
      )
    ) {
      return true;
    }
    if (
      !PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_TARGET_OBSERVED_WORKFLOW_STEPS
        .has(operation?.workflowStep) ||
      !this.repository ||
      typeof this.repository.getObservedReplicaStatusFromCache !==
        TYPEOF.FUNCTION
    ) {
      return false;
    }
    return (
      this.repository.getObservedReplicaStatusFromCache(
        operation.replicaId,
        operation.partitionId,
        operation.targetNodeId,
        EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
      ) === ReplicaStatus.ACTIVE
    );
  }

  buildPriorityRecoveryOperationDrainReleaseEvidence(
    operation,
    completion,
    sourceSnapshot,
  ) {
    const ownerNodeId =
      this.repository.resolveOperationOwnerNodeId(operation) || null;
    const completionAccepted =
      completion &&
      typeof completion === TYPEOF.OBJECT &&
      PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES.has(
        completion.state,
      );
    const sourceState =
      sourceSnapshot?.state ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE;
    return Object.freeze({
      releaseEligibleReplace:
        this.isPriorityRecoveryOperationDrainReleaseEligibleReplace(operation),
      completionAccepted,
      sourceRemovalPending:
        PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_SOURCE_STATES.has(
          sourceState,
        ),
      remoteOwnerUnavailable:
        this.isPriorityRecoveryDrainOwnerUnavailable(ownerNodeId, operation),
      ownerNodeId,
      sourceState,
    });
  }
}

export {OperationWorkflowOwnerSegment7Stage3};
