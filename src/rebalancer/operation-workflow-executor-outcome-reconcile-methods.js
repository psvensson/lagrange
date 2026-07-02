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

// CL-029: bound on consecutive lane waits in the re-drive loop (each wait
// is a full holder execution, not a poll); past it the timed retry owns
// the evidence.
const EXECUTOR_OUTCOME_REDRIVE_MAX_LANE_WAITS = 50;

// CL-029: timed outcome retries back off exponentially per operation up
// to this cap (reset whenever the evidence is consumed); a fixed
// quarter-second cadence with a warn per arm is an observer-effect storm
// while the blocking condition persists.
const EXECUTOR_OUTCOME_RETRY_MAX_DELAY_MS = SHARED.TIME_MS.SECOND * 30;

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
  [WORKFLOW_STEP.PENDING, 1],
  [WORKFLOW_STEP.SENDING, 2],
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
    this.redriveExecutorOutcomeReconcile(operationId).catch(() => null);
  }

  /**
   * CL-029: apply retained executor-outcome evidence under the operation
   * lane until it is consumed. operationWorkflowRunExclusive COALESCES —
   * a held lane returns the holder's promise and discards the factory —
   * so a plain single submission loses the evidence whenever the dispatch
   * step-walk (or any other holder) owns the lane when the outcome
   * arrives (the target_sync wedge). Awaiting the coalesced promise IS
   * the wait for the holder to finish; the loop then resubmits the
   * LATEST retained payload. Exits: payload consumed (applied), a retry
   * timer armed (it re-enters here on fire), payload left untouched by a
   * reconcile that ran (intentional non-consumption, e.g. remote-owner
   * wake), reconcile error (routed to the transition-retry machinery),
   * or the lane-wait cap (falls back to the timed retry so the evidence
   * keeps an owner). A holder's rejection is NOT the outcome's failure —
   * it has its own retry owners — so !factoryRan rejections just loop.
   * @param {string} operationId
   * @return {Promise<void>}
   */
  async redriveExecutorOutcomeReconcile(operationId) {
    if (
      !operationId ||
      this.executorOutcomeRedriveInFlightByOperationId.has(operationId)
    ) {
      return;
    }
    this.executorOutcomeRedriveInFlightByOperationId.add(operationId);
    try {
      for (
        let laneWait = 0;
        laneWait < EXECUTOR_OUTCOME_REDRIVE_MAX_LANE_WAITS;
        laneWait++
      ) {
        if (this.isShuttingDown || !this.isInitialized) {
          return;
        }
        const payload =
          this.executorOutcomeRetryPayloadByOperationId.get(operationId);
        if (!payload) {
          return;
        }
        if (this.executorOutcomeRetryTimerByOperationId.has(operationId)) {
          return;
        }
        let factoryRan = false;
        try {
          await this.operationWorkflowRunExclusive(
            this.getOperationOwnerSingleFlightKey(operationId),
            () => {
              factoryRan = true;
              return this.reconcileExecutorOutcome(payload);
            },
          );
        } catch (error) {
          if (!factoryRan) {
            continue;
          }
          // Retryable reconcile failures re-arm the OUTCOME retry (with
          // the deferred completion context preserved); non-retryable
          // failures log OUTCOME_TRANSITION_FAILED. Either way the error
          // belongs to the outcome, never to the coalesced lane holder.
          this.handleDeferredExecutorOutcomeRetryFailure(
            payload,
            error,
            null,
          );
          return;
        }
        if (!factoryRan) {
          continue;
        }
        const retainedAfterRun =
          this.executorOutcomeRetryPayloadByOperationId.get(operationId);
        if (retainedAfterRun === payload) {
          return;
        }
      }
      if (this.isShuttingDown || !this.isInitialized) {
        return;
      }
      const retained =
        this.executorOutcomeRetryPayloadByOperationId.get(operationId);
      if (retained) {
        this.scheduleExecutorOutcomeRetry(retained, null);
      }
    } finally {
      this.executorOutcomeRedriveInFlightByOperationId.delete(operationId);
    }
  }

  buildExecutorFailureOutcomeErrorLike(
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
        this.getExecutorOutcomeStringField(deferredOutcome, 'completionState'),
      reasonCode:
        this.getExecutorOutcomeStringField(deferredOutcome, 'reasonCode'),
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

  cloneExecutorOutcomeRetryPayload(outcome) {
    return Object.freeze({...outcome});
  }

  getExecutorOutcomeRetryWorkflowStepRank(outcome) {
    return (
      EXECUTOR_OUTCOME_RETRY_WORKFLOW_STEP_RANK.get(
        outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP],
      ) ||
      -1
    );
  }

  isFailureExecutorOutcome(outcome) {
    return (
      EXECUTOR_OUTCOME_ACTION_MAP[
        outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]
      ]?.action === EXECUTOR_OUTCOME_ACTION.FAIL
    );
  }

  selectExecutorOutcomeRetryPayload(existingOutcome, candidateOutcome) {
    if (!existingOutcome) {
      return candidateOutcome;
    }
    // CL-029 verification finding: a retained FAILURE payload carries
    // WORKFLOW_STEP.FAILED (top rank) and would mask every later success
    // outcome from a recreated replica — newer success evidence always
    // supersedes retained failure evidence.
    if (
      this.isFailureExecutorOutcome(existingOutcome) &&
      !this.isFailureExecutorOutcome(candidateOutcome)
    ) {
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
    this.executorOutcomeRetryDelayMsByOperationId.delete(operationId);
  }

  /**
   * CL-029: applying one outcome must not destroy retained evidence for a
   * FURTHER step (e.g. a SYNCING application while the ACTIVE payload is
   * retained). Clear only when the retained payload does not outrank what
   * was just applied.
   * @param {string} operationId
   * @param {Object} appliedOutcome
   */
  clearExecutorOutcomeRetryIfNotAhead(operationId, appliedOutcome) {
    const retained =
      this.executorOutcomeRetryPayloadByOperationId.get(operationId);
    if (
      retained &&
      this.getExecutorOutcomeRetryWorkflowStepRank(retained) >
        this.getExecutorOutcomeRetryWorkflowStepRank(appliedOutcome)
    ) {
      return;
    }
    this.clearExecutorOutcomeRetry(operationId);
  }

  buildExecutorOutcomeVisibilityRetryError(visibilityObservation) {
    const retryAfterMs = Number.isFinite(visibilityObservation?.retryAfterMs) &&
      visibilityObservation.retryAfterMs > 0 ?
      Math.floor(visibilityObservation.retryAfterMs) :
      OBSERVED_PROGRESS_RETRY_DELAY_MS;
    const deferredOutcome =
      visibilityObservation?.deferredOutcome &&
      typeof visibilityObservation.deferredOutcome === 'object' ?
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
    error.completionState =
      this.getExecutorOutcomeStringField(deferredOutcome, 'completionState');
    error.reasonCode =
      this.getExecutorOutcomeStringField(deferredOutcome, 'reasonCode');
    error.partitionId =
      this.getExecutorOutcomeStringField(deferredOutcome, 'partitionId') ||
      this.getExecutorOutcomeStringField(
        visibilityObservation?.operation,
        'partitionId',
      );
    return error;
  }

  handleDeferredExecutorOutcomeRetryFailure(
    outcome,
    error,
    priorVisibilityObservation = null,
  ) {
    if (isRetryableControlPlaneError(error)) {
      return this.scheduleExecutorOutcomeRetry(
        outcome,
        this.buildExecutorOutcomeRetryVisibilityObservation(
          error,
          priorVisibilityObservation,
        ),
      );
    }
    // Non-retryable: the evidence is undeliverable — drop it so it cannot
    // linger driverless and mask later outcomes (CL-029).
    this.clearExecutorOutcomeRetry(
      outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID],
    );
    const retryContext =
      this.buildExecutorOutcomeRetryContext(outcome, priorVisibilityObservation);
    this.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_TRANSITION_FAILED,
      {
        operationId: outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID],
        outcomeType: outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE],
        partitionId: retryContext.partitionId,
        workflowStep: retryContext.workflowStep,
        completionState: retryContext.completionState,
        reasonCode: retryContext.reasonCode,
        error: error.message,
      },
    );
    return false;
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
    // CL-029: exponential backoff per operation, capped; the streak resets
    // when the evidence is consumed (clearExecutorOutcomeRetry).
    const previousDelayMs =
      this.executorOutcomeRetryDelayMsByOperationId.get(operationId);
    const delayMs = Number.isFinite(previousDelayMs) ?
      Math.min(
        previousDelayMs * 2,
        EXECUTOR_OUTCOME_RETRY_MAX_DELAY_MS,
      ) :
      retryError.retryAfterMs;
    this.executorOutcomeRetryDelayMsByOperationId.set(operationId, delayMs);
    const retryContext =
      this.buildExecutorOutcomeRetryContext(selectedPayload, visibilityObservation);
    // Warn-per-arm is rate-bounded by the exponential backoff (the
    // CL-009-class storm risk was the prior FIXED quarter-second cadence).
    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED,
      {
        operationId,
        boundary: retryContext.boundary,
        workflowStep: retryContext.workflowStep,
        partitionId: retryContext.partitionId,
        completionState: retryContext.completionState,
        reasonCode: retryContext.reasonCode,
        delayMs,
        errorMessage: retryError.message,
      },
    );
    const timerHandle = this.setTimeoutFn(() => {
      this.executorOutcomeRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
        return;
      }
      // CL-029: the retained payload stays in the map until applied; the
      // re-drive loop handles held lanes by awaiting the holder, so the
      // old lane-held re-arm (which warn-spun at a fixed cadence) is gone.
      return this.redriveExecutorOutcomeReconcile(operationId)
        .catch((error) => {
          const retryOutcome =
            this.executorOutcomeRetryPayloadByOperationId.get(operationId);
          if (!retryOutcome) {
            return;
          }
          this.handleDeferredExecutorOutcomeRetryFailure(
            retryOutcome,
            error,
            visibilityObservation,
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
      typeof visibilityObservation.operation === 'object' ?
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
    // CL-029: do NOT clear the retained payload here — clearing before
    // the action applies destroyed the evidence on every silently
    // non-applying path (stale-CAS updateStep, replay no-ops). Each
    // action branch clears on successful application.

    if (this.repository.isOperationTerminal(operation)) {
      this.clearExecutorOutcomeRetry(operationId);
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
      // The remote owner converges from the durable row + its own
      // executor evidence; retaining the payload locally would leave a
      // driverless entry that can mask later outcomes (CL-029).
      this.clearExecutorOutcomeRetry(operationId);
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
      this.clearExecutorOutcomeRetry(operationId);
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
      this.clearExecutorOutcomeRetryIfNotAhead(operationId, outcome);
    } else if (shouldResumeReplaceActivePhase) {
      const applied = await this.reconcileReplaceActualActive(operation);
      if (applied === false) {
        // CL-029: completion evidence that could not be applied (stale-CAS
        // updateStep + replay found nothing actionable) keeps its retry
        // owner; a later attempt re-reads fresh visibility and applies.
        this.scheduleExecutorOutcomeRetry(outcome, visibilityObservation);
      } else {
        this.clearExecutorOutcomeRetryIfNotAhead(operationId, outcome);
      }
    } else if (mapping.action === EXECUTOR_OUTCOME_ACTION.COMPLETE) {
      await this.completeOperation(operation);
      this.clearExecutorOutcomeRetry(operationId);
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
        // CL-029 verification finding: the transition retry now owns this
        // operation's convergence from the durable row; a retained FAILED
        // payload left behind would outrank and mask the recreated
        // replica's later success outcomes.
        this.clearExecutorOutcomeRetry(operationId);
        return true;
      }
      await this.failOperation(
        operation,
        errorLike?.message || errorMessage || outcomeType,
      );
      this.clearExecutorOutcomeRetry(operationId);
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
      operationStepRank !== -1 &&
      outcomeStepRank !== -1 &&
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
