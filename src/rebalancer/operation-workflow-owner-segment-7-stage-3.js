import {OperationWorkflowOwnerSegment7Stage2} from './operation-workflow-owner-segment-7-stage-2.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-owner-segment-7-stage-shared.js';

const {
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
  TYPEOF,
  WORKFLOW_STEP,
  isPriorityControlPlanePartition,
} = SHARED;

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

    const operation = await this.repository.queryOperationById(operationId);
    if (!operation) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_FOUND,
        {operationId, outcomeType},
      );
      return false;
    }

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
      await this.failOperation(operation, errorMessage || outcomeType);
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
