import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  OperationWorkflowTransitionOrchestration,
} from './operation-workflow-transition-orchestration.js';
import {
  shouldReleaseReservationForTerminalOutcome,
} from './operation-workflow-terminal-reservation-release.js';
import {
  TERMINAL_TRANSITION_REPAIR_CAUSE,
  armTerminalTransitionRepair,
} from './operation-workflow-terminal-transition-repair.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';

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
  WORKFLOW_STEP,
  WORKFLOW_STEP_TO_STATUS,
  isCoordinatorOwnedOperationType,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD =
  'priorityDeferredClaimExpectedStep';

// completeOperation/failOperation report their typed transition outcome
// ({committed, disposition}) so level-triggered callers (the recovery
// drain) stop believing unconditional progress. The early already-terminal
// return is the local idempotent-replay arm: the live operation object only
// carries finalStep + completedAt after a PROVEN terminal (a committed
// write, a locally replayed committed transition, or an adopted durable
// winner), so it reports the release-gated replay outcome.
const ALREADY_TERMINAL_TRANSITION_OUTCOME = Object.freeze({
  committed: false,
  disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
});

class OperationWorkflowTransitionPersistence
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
  async claimPriorityDispatchTransition(operation) {
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
            ] === 'string'
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
          this.buildPriorityDispatchTransitionMutationBudget(
            operation,
            now,
          );
        let transitionCommitted;
        try {
          transitionCommitted =
            await this.repository.persistOperationUpdate(projectedOperation, {
              ...this.buildOperationTransitionPersistOptions(),
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
          this.repository.applyLocalPriorityOperationProgressRow(
            projectedOperation,
          );
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
   * Clear every owner-local retry lane for one operation whose terminal
   * state is PROVEN durable. Clearing is a consequence of a proven
   * terminal (this writer committed, a winning durable terminal was
   * adopted, or the row already held the same terminal) — never a
   * precondition of attempting one: erasing the armed retry owners at
   * entry silenced the executor-outcome visibility loop mid-backoff while
   * the terminal write itself was refused (quest
   * terminal-write-refusal-retry-ownership).
   * @param {Object|null} operation
   * @private
   */
  clearTerminalOperationRetryState(operation) {
    this.clearDispatchRetry(operation?.operationId);
    this.clearObservedProgressRetry(operation?.operationId, {
      includeDeliveredCreateProgress: true,
    });
    this.clearPriorityActiveReplaceRetry(operation?.operationId || null);
    this.clearExecutorOutcomeRetry(operation?.operationId);
  }

  /**
   * Resolve one not-committed terminal transition. The release-gated
   * dispositions (TERMINAL_ADOPTED, IDEMPOTENT_REPLAY) prove a durable
   * terminal through another writer or an identical replay: the retry
   * lanes clear and the reservation releases exactly as before. Every
   * other outcome (REFUSED / REINSERTED / null disposition) is unresolved
   * divergence: the retry lanes stay armed, ONE typed warn names the
   * refusal, and the EXISTING terminal-transition repair is armed with the
   * retained terminal projection — a refused terminal write is a strictly
   * worse state than committed-but-invisible and must keep a retry owner
   * (quest terminal-write-refusal-retry-ownership).
   * @param {Object} operation
   * @param {Object} projectedOperation - Retained terminal projection.
   * @param {Object} transitionOutcome - Typed {committed, disposition}.
   * @param {string} step - The terminal workflow step this writer asserted.
   * @return {Promise<void>}
   * @private
   */
  async resolveNotCommittedTerminalTransition(
    operation,
    projectedOperation,
    transitionOutcome,
    step,
  ) {
    this.clearTransitionRetry(operation.operationId);
    // Release only on a proven terminal: lost-to-other-terminal
    // (TERMINAL_ADOPTED) or already-same-terminal (IDEMPOTENT_REPLAY).
    // Unresolved divergence (REFUSED/REINSERTED) keeps the reservation
    // ACTIVE — the operation is still live and re-driveable (audit
    // findings 3+11).
    if (shouldReleaseReservationForTerminalOutcome(transitionOutcome)) {
      this.clearTerminalOperationRetryState(operation);
      await this.releaseReservationForOperation(operation);
    } else {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG
          .TERMINAL_TRANSITION_PERSIST_NOT_COMMITTED,
        {
          operationId: operation.operationId,
          disposition: transitionOutcome?.disposition || null,
          step,
          partitionId: operation.partitionId,
        },
      );
      armTerminalTransitionRepair(
        this,
        projectedOperation,
        TERMINAL_TRANSITION_REPAIR_CAUSE.PERSIST_NOT_COMMITTED,
      );
    }
    this.clearDeferredSafetyBlockState(operation.operationId);
  }

  /**
   * Complete an operation successfully.
   * @param {Object} operation
   * @return {Promise<Object>} Typed transition outcome
   *   ({committed, disposition}) of the terminal persist.
   */
  async completeOperation(operation) {
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
      return ALREADY_TERMINAL_TRANSITION_OUTCOME;
    }
    const previousStep = operation.workflowStep;
    const stepEntry = this.buildOperationTransitionStepEntry(
      operation,
      finalStep,
      OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
      previousStep,
      now,
    );
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

    const persistFn = async () => {
      return this.repository.persistOperationUpdate(
        projectedOperation,
        {
          ...this.buildOperationTransitionPersistOptions(),
          terminalTransition: true,
          returnDisposition: true,
        },
      );
    };
    const transitionOutcome = await this.executeAtomicTransition(
      operation,
      finalStep,
      OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
      persistFn,
      {
        onIdempotentTransition: projectIdempotentTransition,
        afterCommit: async () => {
          await this.confirmCommittedTransitionPersistence(
            projectedOperation,
            {terminalTransitionRepair: true},
          );
        },
      },
    );

    if (!transitionOutcome?.committed) {
      await this.resolveNotCommittedTerminalTransition(
        operation,
        projectedOperation,
        transitionOutcome,
        finalStep,
      );
      return transitionOutcome;
    }

    this.clearTerminalOperationRetryState(operation);
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
    return transitionOutcome;
  }

  /**
   * Fail an operation.
   * @param {Object} operation
   * @param {string} errorMessage
   * @param {Object} [options]
   * @return {Promise<Object>} Typed transition outcome
   *   ({committed, disposition}) of the terminal persist.
   */
  async failOperation(operation, errorMessage, options = {}) {
    const now = Date.now();
    if (
      operation.workflowStep === WORKFLOW_STEP.FAILED &&
      operation.completedAt !== null &&
      operation.completedAt !== undefined
    ) {
      return ALREADY_TERMINAL_TRANSITION_OUTCOME;
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
    const failedStepEntry = this.buildOperationTransitionStepEntry(
      operation,
      WORKFLOW_STEP.FAILED,
      transitionReason,
      previousStep,
      now,
    );
    if (
      options.stepMetadata &&
      typeof options.stepMetadata === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      Object.assign(failedStepEntry, options.stepMetadata);
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

    const persistFn = async () => {
      return this.repository.persistOperationUpdate(
        projectedOperation,
        {
          ...this.buildOperationTransitionPersistOptions(),
          terminalTransition: true,
          returnDisposition: true,
        },
      );
    };
    const transitionOutcome = await this.executeAtomicTransition(
      operation,
      WORKFLOW_STEP.FAILED,
      transitionReason,
      persistFn,
      {
        onIdempotentTransition: projectIdempotentTransition,
        afterCommit: async () => {
          await this.confirmCommittedTransitionPersistence(
            projectedOperation,
            {terminalTransitionRepair: true},
          );
        },
      },
    );

    if (!transitionOutcome?.committed) {
      // Same fail-closed release gate as completeOperation: never release
      // on the unresolved-divergence arm (audit findings 3+11).
      await this.resolveNotCommittedTerminalTransition(
        operation,
        projectedOperation,
        transitionOutcome,
        WORKFLOW_STEP.FAILED,
      );
      return transitionOutcome;
    }

    this.clearTerminalOperationRetryState(operation);
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
    return transitionOutcome;
  }
}

export {OperationWorkflowTransitionPersistence};
