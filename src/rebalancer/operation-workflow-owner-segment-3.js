import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  OperationWorkflowTransitionOrchestration,
} from './operation-workflow-transition-orchestration.js';

const {
  ControlPlaneReadinessService,
  FAILURE_LOG_LEVEL,
  METRICS_LOG_TAG,
  OPERATION_METADATA_KEY,
  OPERATION_TRANSITION_REASON,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  ReplicaStatus,
  TRANSITION_STEP_OPTIONS,
  TYPEOF,
  WORKFLOW_STEP,
  WORKFLOW_STEP_TO_STATUS,
  isCoordinatorOwnedOperationType,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD =
  'priorityDeferredClaimExpectedStep';

class OperationWorkflowOwnerSegment3
  extends OperationWorkflowTransitionOrchestration {
  /**
   * Claim one priority control-plane operation for dispatch without relying on
   * a transition-scoped distributed transaction. The claim remains single-
   * flight and compare-and-set guarded on the durable PENDING row.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async claimPriorityDispatchTransition(operation, options = {}) {
    if (
      !operation ||
      operation.workflowStep !== WORKFLOW_STEP.PENDING ||
      !this.repository.isOperationLocallyOwned(operation) ||
      !isCoordinatorOwnedOperationType(operation.type)
    ) {
      return null;
    }

    return this.repository.runReplicaOperationTransitionExclusive(
      async () => {
        const step = WORKFLOW_STEP.SENDING;
        const previousStep = operation.workflowStep;
        const transitionReason = OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
        const now = Date.now();
        const readinessDecisionDimension =
          this.resolveOperationReadinessDecisionDimension(operation);
        const targetNodeId = operation.targetNodeId;
        const targetReadiness = targetNodeId ?
          this.controlPlaneReadinessService.getNodeReadinessSync(
            targetNodeId,
            {
              decisionDimension: readinessDecisionDimension,
            },
          ) :
          null;
        const readinessSnapshot =
          ControlPlaneReadinessService.compactSnapshotSummary(
            targetReadiness,
            readinessDecisionDimension,
          );
        const persistedStatus =
          WORKFLOW_STEP_TO_STATUS[step] || operation.status;
        const stepEntry = {
          step,
          timestamp: now,
          previousStep,
          reason: transitionReason,
          ownerKey: operation.operationId,
        };
        if (readinessSnapshot) {
          stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] =
            readinessSnapshot;
        }
        const projectedOperation = {
          ...operation,
          workflowStep: step,
          updatedAt: now,
          status: persistedStatus,
          stepsHistory: [
            ...(Array.isArray(operation.stepsHistory) ?
              operation.stepsHistory :
              []),
            stepEntry,
          ],
        };
        const commitProjectedState = (nextOperation) => {
          nextOperation.workflowStep = step;
          nextOperation.updatedAt = now;
          nextOperation.status = persistedStatus;
          nextOperation.stepsHistory = projectedOperation.stepsHistory;
          if (
            typeof projectedOperation[
              PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD
            ] === TYPEOF.STRING
          ) {
            nextOperation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD] =
              projectedOperation[
                PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD
              ];
          } else {
            delete nextOperation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD];
          }
        };

        this.ensureOperationWorkflow(operation);
        if (
          this.operationWorkflowCoordinator.isTransitionIdempotent(
            operation.operationId,
            step,
          )
        ) {
          commitProjectedState(operation);
          return operation;
        }

        await this.operationWorkflowCoordinator.transitionStep(
          operation.operationId,
          {nextStep: step, reason: transitionReason},
          {},
          TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
        );

        const mutationBudget =
          this.buildPriorityDispatchTransitionMutationBudget(now);
        let transitionCommitted;
        try {
          transitionCommitted =
            await this.repository.persistOperationUpdate(projectedOperation, {
              ...this.buildOperationTransitionPersistOptions(operation, null),
              confirmPersistence: true,
              expectedWorkflowStep: WORKFLOW_STEP.PENDING,
              timeoutBudget: mutationBudget,
            });
        } catch (error) {
          if (!this.shouldUsePriorityDispatchDeferredLocalClaim(
            operation,
            error,
          )) {
            throw error;
          }
          projectedOperation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD] =
            previousStep;
          commitProjectedState(operation);
          return operation;
        }

        if (!transitionCommitted) {
          const authoritativeOperation =
            await this.repository.queryAuthoritativeOperationById(
              operation.operationId,
              {
                requireOwnerRpcRead: false,
              },
            );
          if (
            !authoritativeOperation ||
            !this.repository.isOperationLocallyOwned(authoritativeOperation) ||
            authoritativeOperation.workflowStep === WORKFLOW_STEP.PENDING
          ) {
            return null;
          }
          this.operationWorkflowCoordinator.markTransitionCommitted(
            operation.operationId,
            step,
          );
          Object.assign(operation, authoritativeOperation);
          return operation;
        }

        this.clearTransitionRetry(operation.operationId);
        this.operationWorkflowCoordinator.markTransitionCommitted(
          operation.operationId,
          step,
        );
        commitProjectedState(operation);

        this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.STEP_CHANGED, {
          operationId: operation.operationId,
          previousStep,
          newStep: step,
          reason: transitionReason,
          status: operation.status,
          partitionId: operation.partitionId,
          ingress: OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CLAIM_CAS,
        });

        this.emitter.emit(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, {
          operation,
          previousStep,
          newStep: step,
          reason: transitionReason,
        });

        return operation;
      },
      {operation},
    );
  }

  /**
   * Complete an operation successfully.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async completeOperation(operation) {
    this.clearDispatchRetry(operation?.operationId);
    this.clearPriorityActiveReplaceRetry(operation?.operationId || null);
    const now = Date.now();
    const finalStep =
      operation.type === OperationType.ADD ?
        WORKFLOW_STEP.ACTIVE :
        WORKFLOW_STEP.REMOVED;
    if (
      operation.workflowStep === finalStep &&
      operation.completedAt !== null &&
      operation.completedAt !== undefined
    ) {
      return;
    }
    const previousStep = operation.workflowStep;
    const readinessDecisionDimension =
      this.resolveOperationReadinessDecisionDimension(operation);

    const targetNodeId = operation.targetNodeId;
    const targetReadiness = targetNodeId ?
      this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, {
        decisionDimension: readinessDecisionDimension,
      }) :
      null;
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        readinessDecisionDimension,
      );
    const stepEntry = {
      step: finalStep,
      timestamp: now,
      previousStep,
      reason: OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
      ownerKey: operation.operationId,
    };
    if (readinessSnapshot) {
      stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] = readinessSnapshot;
    }
    const projectedOperation = {
      ...operation,
      workflowStep: finalStep,
      status: WORKFLOW_STEP_TO_STATUS[finalStep],
      updatedAt: now,
      completedAt: now,
      stepsHistory: [
        ...(Array.isArray(operation.stepsHistory) ?
          operation.stepsHistory :
          []),
        stepEntry,
      ],
    };
    const projectIdempotentTransition = () => {
      operation.workflowStep = finalStep;
      operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
      const previousUpdatedAt = Number(operation.updatedAt);
      operation.updatedAt = Number.isFinite(previousUpdatedAt) ?
        Math.max(previousUpdatedAt, now) :
        now;
      const previousCompletedAt = Number(operation.completedAt);
      operation.completedAt = Number.isFinite(previousCompletedAt) ?
        Math.max(previousCompletedAt, now) :
        now;
    };

    const persistFn = async (sessionId) => {
      await this.repository.persistOperationUpdate(
        projectedOperation,
        this.buildOperationTransitionPersistOptions(operation, sessionId),
      );
    };
    const bypassExecutionTransaction =
      this.shouldBypassTransitionExecutionTransaction(operation);

    const transitionCommitted = await this.executeAtomicTransition(
      operation,
      finalStep,
      OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
      persistFn,
      {
        onIdempotentTransition: projectIdempotentTransition,
        bypassExecutionTransaction,
        afterCommit: async () => {
          await this.confirmCommittedTransitionPersistence(projectedOperation);
        },
      },
    );

    if (!transitionCommitted) {
      this.clearTransitionRetry(operation.operationId);
      await this.releaseReservationForOperation(operation);
      this.clearDeferredSafetyBlockState(operation.operationId);
      return;
    }

    this.clearTransitionRetry(operation.operationId);
    operation.workflowStep = finalStep;
    operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
    operation.updatedAt = now;
    operation.completedAt = now;
    operation.stepsHistory.push(stepEntry);

    await this.releaseReservationForOperation(operation);
    this.clearDeferredSafetyBlockState(operation.operationId);

    this.stats.operationsCompleted++;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_COMPLETED, {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    this.emitter.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
      operation,
    });

    try {
      this.logger.info(METRICS_LOG_TAG.REBALANCE_OPERATION, {
        operationId: operation.operationId,
        entityType: operation.entityType,
        finalState: operation.status,
        totalDurationMs: now - operation.createdAt,
      });
    } catch (_metricsErr) {
      // Metrics logging failures must not propagate to callers
    }
  }

  /**
   * Fail an operation.
   * @param {Object} operation
   * @param {string} errorMessage
   * @param {Object} [options]
   * @return {Promise<void>}
   */
  async failOperation(operation, errorMessage, options = {}) {
    this.clearDispatchRetry(operation?.operationId);
    this.clearPriorityActiveReplaceRetry(operation?.operationId || null);
    const now = Date.now();
    if (
      operation.workflowStep === WORKFLOW_STEP.FAILED &&
      operation.completedAt !== null &&
      operation.completedAt !== undefined
    ) {
      return;
    }
    const normalizedError = this.normalizeErrorMessage(
      errorMessage,
      'Unknown error',
    );
    const isSafetyBlocked = this.isSafetyPolicyFailure(normalizedError);
    const logLevel =
      options.logLevel ||
      (isSafetyBlocked ? FAILURE_LOG_LEVEL.WARN : FAILURE_LOG_LEVEL.ERROR);
    const logMessage =
      options.logMessage ||
      (isSafetyBlocked ?
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY :
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED);
    const previousStep = operation.workflowStep;
    const transitionReason = isSafetyBlocked ?
      OPERATION_TRANSITION_REASON.SAFETY_POLICY_BLOCKED :
      OPERATION_TRANSITION_REASON.OPERATION_FAILED;
    const readinessDecisionDimension =
      this.resolveOperationReadinessDecisionDimension(operation);

    const targetNodeId = operation.targetNodeId;
    const targetReadiness = targetNodeId ?
      this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, {
        decisionDimension: readinessDecisionDimension,
      }) :
      null;
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        readinessDecisionDimension,
      );
    const failedStepEntry = {
      step: WORKFLOW_STEP.FAILED,
      timestamp: now,
      previousStep,
      reason: transitionReason,
      ownerKey: operation.operationId,
    };
    if (
      options.stepMetadata &&
      typeof options.stepMetadata === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      Object.assign(failedStepEntry, options.stepMetadata);
    }
    if (readinessSnapshot) {
      failedStepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] =
        readinessSnapshot;
    }
    const projectedOperation = {
      ...operation,
      workflowStep: WORKFLOW_STEP.FAILED,
      status: ReplicaStatus.FAILED,
      updatedAt: now,
      completedAt: now,
      errorMessage: normalizedError,
      stepsHistory: [
        ...(Array.isArray(operation.stepsHistory) ?
          operation.stepsHistory :
          []),
        failedStepEntry,
      ],
    };
    const projectIdempotentTransition = () => {
      operation.workflowStep = WORKFLOW_STEP.FAILED;
      operation.status = ReplicaStatus.FAILED;
      const previousUpdatedAt = Number(operation.updatedAt);
      operation.updatedAt = Number.isFinite(previousUpdatedAt) ?
        Math.max(previousUpdatedAt, now) :
        now;
      const previousCompletedAt = Number(operation.completedAt);
      operation.completedAt = Number.isFinite(previousCompletedAt) ?
        Math.max(previousCompletedAt, now) :
        now;
      operation.errorMessage = normalizedError;
    };

    const persistFn = async (sessionId) => {
      await this.repository.persistOperationUpdate(
        projectedOperation,
        this.buildOperationTransitionPersistOptions(operation, sessionId),
      );
    };
    const bypassExecutionTransaction =
      this.shouldBypassTransitionExecutionTransaction(operation);

    const transitionCommitted = await this.executeAtomicTransition(
      operation,
      WORKFLOW_STEP.FAILED,
      transitionReason,
      persistFn,
      {
        onIdempotentTransition: projectIdempotentTransition,
        bypassExecutionTransaction,
        afterCommit: async () => {
          await this.confirmCommittedTransitionPersistence(projectedOperation);
        },
      },
    );

    if (!transitionCommitted) {
      this.clearTransitionRetry(operation.operationId);
      await this.releaseReservationForOperation(operation);
      this.clearDeferredSafetyBlockState(operation.operationId);
      return;
    }

    this.clearTransitionRetry(operation.operationId);
    operation.workflowStep = WORKFLOW_STEP.FAILED;
    operation.status = ReplicaStatus.FAILED;
    operation.updatedAt = now;
    operation.completedAt = now;
    operation.errorMessage = normalizedError;
    operation.stepsHistory.push(failedStepEntry);

    await this.releaseReservationForOperation(operation);
    this.clearDeferredSafetyBlockState(operation.operationId);

    this.stats.operationsFailed++;

    const logPayload = {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
      errorMessage: normalizedError,
    };

    const logMethod =
      logLevel === FAILURE_LOG_LEVEL.WARN &&
      typeof this.logger.warn === 'function' ?
        this.logger.warn.bind(this.logger) :
        this.logger.error.bind(this.logger);

    logMethod(logMessage, logPayload);

    this.emitter.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED, {
      operation,
      errorMessage: normalizedError,
    });

    try {
      this.logger.info(METRICS_LOG_TAG.REBALANCE_OPERATION, {
        operationId: operation.operationId,
        entityType: operation.entityType,
        finalState: operation.status,
        totalDurationMs: now - operation.createdAt,
      });
    } catch (_metricsErr) {
      // Metrics logging failures must not propagate to callers
    }
  }
}

export {OperationWorkflowOwnerSegment3};
