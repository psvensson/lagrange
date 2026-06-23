import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerExecutionLane} from './operation-workflow-owner-execution-lane.js';

const {
  AUTHORITATIVE_TRANSITION_RECOVERY_STATUS,
  ControlPlaneReadinessService,
  DISPATCH_RETRY_DELAY_MS,
  INITIAL_PARTITION_IDS,
  NUM,
  OPERATION_METADATA_KEY,
  OPERATION_TRANSITION_REASON,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECOVERABLE_TRANSITION_COMMIT_STATUS,
  RECOVERABLE_TRANSITION_ROLLBACK_STATUS,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  SYSTEM_TABLE_NAME,
  TIMEOUT_BUDGET_DEFAULT,
  TRANSITION_RECOVERY_READ_OPTIONS,
  TRANSITION_RECOVERY_SQL,
  TRANSITION_STEP_OPTIONS,
  TYPEOF,
  WORKFLOW_STEP,
  WORKFLOW_STEP_TO_STATUS,
  buildSelectRowsByTransactionIdsSql,
  createTopLevelOperationBudget,
  isCoordinatorOwnedOperationType,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  OperationType,
  readAuthoritativeControlPlaneRows,
} = OPERATION_WORKFLOW_OWNER_SHARED;

// Lever-(a) extension (default-off). When LAGRANGE_PR_DRAIN_LOCAL_PROGRESS=true, the
// owner-local deferred-progress fallback also covers the surplus-DRAIN transitions
// (REPLACE source-removal at ACTIVE, and the REMOVED terminal), not just CREATING — the
// rolling-restart gate witness showed surplus-drain ops stuck there under write_backlog
// with no local-commit fallback, so the over-target voter never drains in budget.
const PRIORITY_DRAIN_LOCAL_PROGRESS_FLAG = 'LAGRANGE_PR_DRAIN_LOCAL_PROGRESS';
function isPriorityDrainLocalProgressEnabled() {
  return process.env[PRIORITY_DRAIN_LOCAL_PROGRESS_FLAG] === 'true';
}

const PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS =
  TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
const PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS = new Set([
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.CREATING,
]);
const PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD =
  'priorityDeferredClaimExpectedStep';

class OperationWorkflowTransitionOrchestration
  extends OperationWorkflowOwnerExecutionLane {
  async loadAuthoritativeTransitionExecutionSession(sessionId) {
    const txCoordinator = this.transactionCoordinator;
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (
      !gateway ||
      typeof txCoordinator?.recoverFromSystemTables !== TYPEOF.FUNCTION ||
      typeof txCoordinator.getTransaction !== TYPEOF.FUNCTION
    ) {
      return null;
    }

    const transactionResult = await readAuthoritativeControlPlaneRows(
      gateway,
      SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      TRANSITION_RECOVERY_SQL.SELECT_TRANSACTIONS_BY_SESSION,
      [sessionId],
      {
        ...TRANSITION_RECOVERY_READ_OPTIONS,
        controlPlaneTableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
        controlPlaneOperationKind: 'read',
      },
    );
    if (transactionResult?.success === false) {
      throw new Error(
        this.normalizeErrorMessage(
          transactionResult.error,
          OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_READ_AUTHORITATIVE_TRANSITION_TRANSACTION_STATE,
        ),
      );
    }
    const transactionRows = (transactionResult?.rows || []).filter((row) =>
      AUTHORITATIVE_TRANSITION_RECOVERY_STATUS.has(row?.status),
    );
    if (transactionRows.length === NUM.ZERO) {
      return null;
    }

    const transactionIds = Array.from(
      new Set(
        transactionRows
          .map((row) => row?.transaction_id || row?.transactionId)
          .filter(
            (value) =>
              typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
          ),
      ),
    );
    let participantRows = [];
    if (transactionIds.length > NUM.ZERO) {
      const participantResult = await readAuthoritativeControlPlaneRows(
        gateway,
        SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
        buildSelectRowsByTransactionIdsSql(
          SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
          transactionIds,
        ),
        transactionIds,
        {
          ...TRANSITION_RECOVERY_READ_OPTIONS,
          controlPlaneTableName: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
          controlPlaneOperationKind: 'read',
        },
      );
      if (participantResult?.success === false) {
        throw new Error(
          this.normalizeErrorMessage(
            participantResult.error,
            OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_READ_AUTHORITATIVE_TRANSITION_PARTICIPANT_STATE,
          ),
        );
      }
      participantRows = participantResult?.rows || [];
    }

    txCoordinator.recoverFromSystemTables({
      transactions: transactionRows,
      participants: participantRows,
      writeOperations: [],
    });
    return txCoordinator.getTransaction(sessionId);
  }

  /**
   * Resolve any lingering transaction state for a transition session before
   * starting a fresh transition attempt on the same session id.
   * @param {string} sessionId
   * @param {Object} [options]
   * @param {boolean} [options.allowAuthoritativeLookup=false]
   * @return {Promise<boolean>}
   */
  async recoverTransitionExecutionSession(sessionId, options = {}) {
    const txCoordinator = this.transactionCoordinator;
    if (
      !txCoordinator ||
      typeof txCoordinator.getTransaction !== TYPEOF.FUNCTION
    ) {
      return false;
    }
    let existingTransaction = txCoordinator.getTransaction(sessionId);
    if (
      !existingTransaction?.status &&
      options.allowAuthoritativeLookup === true
    ) {
      existingTransaction =
        await this.loadAuthoritativeTransitionExecutionSession(sessionId);
    }
    if (!existingTransaction?.status) {
      return false;
    }
    let result = null;
    if (RECOVERABLE_TRANSITION_COMMIT_STATUS.has(existingTransaction.status)) {
      if (typeof txCoordinator.commit !== TYPEOF.FUNCTION) {
        return false;
      }
      result = await txCoordinator.commit(sessionId);
    } else if (
      RECOVERABLE_TRANSITION_ROLLBACK_STATUS.has(existingTransaction.status)
    ) {
      if (typeof txCoordinator.rollback !== TYPEOF.FUNCTION) {
        return false;
      }
      result = await txCoordinator.rollback(sessionId);
    } else {
      return false;
    }
    if (result?.success === true) {
      return true;
    }
    throw new Error(
      this.normalizeErrorMessage(
        result?.error,
        OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_RECOVER_TRANSITION_TRANSACTION,
      ),
    );
  }

  /**
   * Execute a step transition atomically using the distributed
   * transaction coordinator.
   * @param {Object} operation
   * @param {string} step
   * @param {string} reason
   * @param {Function} persistFn
   * @param {Object} [options]
   * @param {Function} [options.onIdempotentTransition]
   * @param {Function} [options.afterCommit]
   * @return {Promise<boolean>} True when this call committed the transition.
   */
  async executeAtomicTransition(
    operation,
    step,
    reason,
    persistFn,
    options = {},
  ) {
    return this.repository.runReplicaOperationTransitionExclusive(
      async () => {
        this.ensureOperationWorkflow(operation);

        if (
          this.operationWorkflowCoordinator.isTransitionIdempotent(
            operation.operationId,
            step,
          )
        ) {
          if (typeof options.onIdempotentTransition === TYPEOF.FUNCTION) {
            options.onIdempotentTransition();
          }
          return false;
        }

        const afterCommit =
          typeof options.afterCommit === TYPEOF.FUNCTION ?
            options.afterCommit :
            null;
        if (options?.bypassExecutionTransaction === true) {
          await this.operationWorkflowCoordinator.transitionStep(
            operation.operationId,
            {nextStep: step, reason},
            {},
            TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
          );
          const persistResult = await persistFn(null);
          if (persistResult === false) {
            return false;
          }
          this.operationWorkflowCoordinator.markTransitionCommitted(
            operation.operationId,
            step,
          );
          if (afterCommit) {
            await afterCommit();
          }
          return true;
        }
        const txCoordinator = this.transactionCoordinator;
        if (
          !txCoordinator ||
          typeof txCoordinator.begin !==
            OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ||
          typeof txCoordinator.commit !==
            OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ||
          typeof txCoordinator.rollback !==
            OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION
        ) {
          throw new Error(
            REBALANCE_COORDINATOR_ERROR_MSG.TRANSACTION_COORDINATOR_REQUIRED,
          );
        }
        const executionAttempt = this.reserveTransitionExecutionAttempt(
          operation.operationId,
          step,
        );
        const sessionId = this.buildTransitionExecutionSessionId(
          operation.operationId,
          step,
          executionAttempt,
        );
        await this.recoverTransitionExecutionSession(sessionId);
        const beginResult = await txCoordinator.begin(sessionId);
        if (!beginResult.success) {
          if (
            this.isStaleTransitionSessionConflict(beginResult.error) ||
            this.isTransitionPartitionContention(beginResult.error)
          ) {
            const recovered = await this.tryRecoverTransitionExecutionSession(
              sessionId,
              beginResult.error,
              {
                allowAuthoritativeLookup: true,
              },
            );
            if (!recovered) {
              this.rotateTransitionExecutionAttemptAfterStaleSessionConflict(
                operation.operationId,
                step,
                sessionId,
                beginResult.error,
              );
            }
          }
          throw new Error(beginResult.error);
        }
        let committed = false;
        try {
          await this.operationWorkflowCoordinator.transitionStep(
            operation.operationId,
            {nextStep: step, reason},
            {},
            TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
          );
          await persistFn(sessionId);
          const commitResult = await txCoordinator.commit(sessionId);
          if (!commitResult.success) {
            throw new Error(commitResult.error);
          }
          committed = true;
          this.operationWorkflowCoordinator.markTransitionCommitted(
            operation.operationId,
            step,
          );
          this.clearTransitionExecutionAttempt(operation.operationId, step);
          if (afterCommit) {
            await afterCommit();
          }
          return true;
        } catch (error) {
          const staleTransitionSessionConflict =
            this.isStaleTransitionSessionConflict(error);
          const transitionPartitionContention =
            this.isTransitionPartitionContention(error);
          if (!committed) {
            const activeTransaction =
              typeof txCoordinator.getTransaction === TYPEOF.FUNCTION ?
                txCoordinator.getTransaction(sessionId) :
                null;
            if (!activeTransaction) {
              if (
                staleTransitionSessionConflict ||
                transitionPartitionContention
              ) {
                const recovered =
                  await this.tryRecoverTransitionExecutionSession(
                    sessionId,
                    error,
                    {
                      allowAuthoritativeLookup: true,
                    },
                  );
                if (!recovered && staleTransitionSessionConflict) {
                  this.rotateTransitionExecutionAttemptAfterStaleSessionConflict(
                    operation.operationId,
                    step,
                    sessionId,
                    error,
                  );
                }
              }
              throw error;
            }
            try {
              const rollbackResult = await txCoordinator.rollback(sessionId);
              if (rollbackResult?.success !== true) {
                throw new Error(
                  this.normalizeErrorMessage(
                    rollbackResult?.error,
                    OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_ROLL_BACK_TRANSITION_TRANSACTION,
                  ),
                );
              }
            } catch (rollbackError) {
              rollbackError.cause = error;
              throw rollbackError;
            }
          }
          if (staleTransitionSessionConflict || transitionPartitionContention) {
            const recovered = await this.tryRecoverTransitionExecutionSession(
              sessionId,
              error,
              {
                allowAuthoritativeLookup: true,
              },
            );
            if (!recovered && staleTransitionSessionConflict) {
              this.rotateTransitionExecutionAttemptAfterStaleSessionConflict(
                operation.operationId,
                step,
                sessionId,
                error,
              );
            }
          }
          throw error;
        }
      },
      {operation},
    );
  }

  /**
   * Update operation workflow step.
   * @param {Object} operation
   * @param {string} step
   * @param {string} [reason]
   * @return {Promise<void>}
   */
  async updateStep(operation, step, reason) {
    const previousStep = operation.workflowStep;
    if (previousStep === step) {
      return false;
    }
    const transitionReason =
      reason || this.resolveTransitionReason(previousStep, step);
    const now = Date.now();
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
    const persistedStatus = WORKFLOW_STEP_TO_STATUS[step] || operation.status;
    const stepEntry = {
      step,
      timestamp: now,
      previousStep,
      reason: transitionReason,
      ownerKey: operation.operationId,
    };
    if (readinessSnapshot) {
      stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] = readinessSnapshot;
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
    const projectIdempotentTransition = () => {
      operation.workflowStep = step;
      operation.status = persistedStatus;
      const previousUpdatedAt = Number(operation.updatedAt);
      operation.updatedAt = Number.isFinite(previousUpdatedAt) ?
        Math.max(previousUpdatedAt, now) :
        now;
      if (step === WORKFLOW_STEP.CREATING) {
        delete operation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD];
      }
    };

    const bypassExecutionTransaction =
      this.shouldBypassTransitionExecutionTransaction(operation);
    const usePriorityDispatchTransitionBudget =
      this.shouldUsePriorityDispatchTransitionMutationBudget(operation, step);

    const persistFn = async (sessionId) => {
      const persistOptions = this.buildOperationTransitionPersistOptions(
        operation,
        sessionId,
      );
      const budgetedPersistOptions =
        usePriorityDispatchTransitionBudget ?
          {
            ...persistOptions,
            timeoutBudget:
              this.buildPriorityDispatchTransitionMutationBudget(
                operation,
                operation.createdAt ?? now,
              ),
          } :
          persistOptions;
      const expectedWorkflowStep =
        this.resolveOperationTransitionExpectedWorkflowStep(
          operation,
          previousStep,
          step,
        );
      const guardedPersistOptions =
        bypassExecutionTransaction ?
          {
            ...budgetedPersistOptions,
            expectedWorkflowStep,
          } :
          budgetedPersistOptions;
      return this.repository.persistOperationUpdate(
        projectedOperation,
        guardedPersistOptions,
      );
    };

    let transitionCommitted;
    try {
      transitionCommitted = await this.executeAtomicTransition(
        operation,
        step,
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
    } catch (error) {
      if (
        !this.shouldUsePriorityDispatchDeferredLocalProgress(
          operation,
          step,
          error,
        ) ||
        !this.recordPriorityDispatchDeferredLocalProgress(
          operation,
          projectedOperation,
          step,
          error,
        )
      ) {
        throw error;
      }
      return true;
    }

    if (!transitionCommitted) {
      if (step !== WORKFLOW_STEP.ACTIVE) {
        this.clearPriorityActiveReplaceRetry(operation?.operationId || null);
      }
      return false;
    }

    this.clearTransitionRetry(operation.operationId);
    if (step !== WORKFLOW_STEP.ACTIVE) {
      this.clearPriorityActiveReplaceRetry(operation.operationId);
    }
    operation.workflowStep = step;
    operation.updatedAt = now;
    operation.status = persistedStatus;
    operation.stepsHistory.push(stepEntry);
    if (step === WORKFLOW_STEP.CREATING) {
      delete operation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD];
    }

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.STEP_CHANGED, {
      operationId: operation.operationId,
      previousStep,
      newStep: step,
      reason: transitionReason,
      status: operation.status,
      partitionId: operation.partitionId,
    });

    this.emitter.emit(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, {
      operation,
      previousStep,
      newStep: step,
      reason: transitionReason,
    });

    return true;
  }

  /**
   * Priority control-plane dispatch claims should not depend on the same
   * transaction-participant machinery they are trying to repair. Narrow only
   * the initial PENDING -> SENDING claim for these partitions.
   *
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldUsePriorityDispatchClaimNarrowPath(operation) {
    const partitionId = String(operation?.partitionId || '').trim();
    return (
      partitionId.length > NUM.ZERO &&
      operation?.workflowStep === WORKFLOW_STEP.PENDING &&
      isPriorityControlPlanePartition({partitionId})
    );
  }

  /**
   * Priority control-plane dispatch progress must stay retryable under the
   * same partition pressure the operation is attempting to repair.
   *
   * @param {Object|null} operation
   * @param {string} step
   * @return {boolean}
   * @private
   */
  shouldUsePriorityDispatchTransitionMutationBudget(operation, step) {
    const partitionId = String(operation?.partitionId || '').trim();
    return (
      partitionId.length > NUM.ZERO &&
      isPriorityControlPlanePartition({partitionId}) &&
      PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS.has(step)
    );
  }

  /**
   * Priority dispatch may locally skip the SENDING durable intermediate under
   * retryable replica_operations owner pressure. The next durable transition
   * must still compare-and-set against the last known authoritative step.
   *
   * @param {Object|null} operation
   * @param {string} previousStep
   * @param {string} step
   * @return {string}
   * @private
   */
  resolveOperationTransitionExpectedWorkflowStep(
    operation,
    previousStep,
    step,
  ) {
    if (
      step === WORKFLOW_STEP.CREATING &&
      this.shouldUsePriorityDispatchTransitionMutationBudget(operation, step) &&
      typeof operation?.[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD] ===
        TYPEOF.STRING &&
      operation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD].length > NUM.ZERO
    ) {
      return operation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD];
    }
    return previousStep;
  }

  /**
   * @param {Object|null} operation
   * @param {Error|Object} errorLike
   * @return {boolean}
   * @private
   */
  shouldUsePriorityDispatchDeferredLocalClaim(operation, errorLike) {
    return (
      this.shouldUsePriorityDispatchClaimNarrowPath(operation) &&
      isRetryableControlPlaneError(errorLike)
    );
  }

  /**
   * Priority dispatch progress has already reached the target executor before
   * CREATING is persisted. Under retryable priority-partition pressure, keep
   * the owner progress visible locally and re-arm the durable transition.
   *
   * @param {Object|null} operation
   * @param {string} step
   * @param {Error|Object} errorLike
   * @return {boolean}
   * @private
   */
  shouldUsePriorityDispatchDeferredLocalProgress(operation, step, errorLike) {
    if (!isRetryableControlPlaneError(errorLike)) {
      return false;
    }
    if (
      step === WORKFLOW_STEP.CREATING &&
      this.shouldUsePriorityDispatchTransitionMutationBudget(operation, step)
    ) {
      return true;
    }
    return this.isPriorityDrainDeferredLocalProgressStep(operation, step);
  }

  /**
   * Lever-(a) extension (default-off LAGRANGE_PR_DRAIN_LOCAL_PROGRESS). The surplus-drain
   * transitions where the rolling-restart gate witness showed ops stuck under
   * write_backlog with no local-commit fallback: the REPLACE source-removal (workflowStep
   * ACTIVE) and the drain terminal (REMOVED). Scoped to priority control-plane partitions
   * (the same scope the CREATING budget gate uses), so the owner can advance the drain
   * locally and re-arm the durable write, draining the over-target voter within budget.
   *
   * @param {Object|null} operation
   * @param {string} step
   * @return {boolean}
   * @private
   */
  isPriorityDrainDeferredLocalProgressStep(operation, step) {
    if (!isPriorityDrainLocalProgressEnabled()) {
      return false;
    }
    const partitionId = String(operation?.partitionId || '').trim();
    if (
      partitionId.length === NUM.ZERO ||
      !isPriorityControlPlanePartition({partitionId})
    ) {
      return false;
    }
    if (step === WORKFLOW_STEP.REMOVED) {
      return true;
    }
    return (
      step === WORKFLOW_STEP.ACTIVE &&
      operation?.type === OperationType.REPLACE
    );
  }

  /**
   * @param {Object} operation
   * @param {Object} projectedOperation
   * @param {string} step
   * @param {Error|Object} errorLike
   * @return {boolean}
   * @private
   */
  recordPriorityDispatchDeferredLocalProgress(
    operation,
    projectedOperation,
    step,
    errorLike,
  ) {
    if (
      !this.deferTransitionRetry(operation.operationId, errorLike, {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH,
        workflowStep: step,
        partitionId: operation.partitionId,
        updatedAt: projectedOperation.updatedAt,
        createdAt: projectedOperation.createdAt,
        operationSnapshot: projectedOperation,
        ingress:
          OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_PROGRESS_DEFERRED_LOCAL,
      })
    ) {
      return false;
    }

    this.repository.applyLocalPriorityOperationProgressRow(projectedOperation);
    this.repository.recordOwnerPersistedTransitionVisibilityWitness(
      projectedOperation,
    );
    this.repository.syncIncompleteOperationObservation(projectedOperation);
    operation.workflowStep = projectedOperation.workflowStep;
    operation.updatedAt = projectedOperation.updatedAt;
    operation.status = projectedOperation.status;
    operation.stepsHistory = projectedOperation.stepsHistory;
    if (step === WORKFLOW_STEP.CREATING) {
      delete operation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD];
    }
    if (step !== WORKFLOW_STEP.ACTIVE) {
      this.clearPriorityActiveReplaceRetry(operation.operationId);
    }
    return true;
  }

  /**
   * Build the per-attempt mutation budget for priority dispatch transitions.
   *
   * @param {Object|null} operation
   * @param {number} startedAtMs
   * @return {Object}
   * @private
   */
  buildPriorityDispatchTransitionMutationBudget(operation, startedAtMs) {
    const normalizedStartedAtMs = Number(startedAtMs);
    return createTopLevelOperationBudget({
      configuredBudgetMs:
        this.resolvePriorityDispatchTransitionMutationBudgetMs(operation),
      startedAtMs: Number.isFinite(normalizedStartedAtMs) ?
        normalizedStartedAtMs :
        Date.now(),
    });
  }

  /**
   * SQL write-operation dispatch owns the short per-attempt repair lane; other
   * priority control-plane claims spend the operation-level budget.
   *
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  resolvePriorityDispatchTransitionMutationBudgetMs(operation) {
    const partitionId = String(operation?.partitionId || '').trim();
    return partitionId ===
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS] ?
      REPLICA_OPERATION_DISPATCH_TIMEOUT_MS :
      PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS;
  }

  /**
   * Build one retryable synthetic error for priority-claim misses.
   *
   * A compare-and-set miss with an unchanged authoritative PENDING row is a
   * pressure/liveness ambiguity, not a hard "not dispatchable" terminal state.
   * Re-arm dispatch through the existing deferred retry lane.
   *
   * @param {Object} operation
   * @return {Error}
   * @private
   */
  buildPriorityDispatchClaimRetryableError(operation) {
    const error = new Error(
      'control_plane_pressure_degraded while claiming priority ' +
        'dispatch transition',
    );
    error.code =
      OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
    error.errorCode =
      OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
    error.retryAfterMs = DISPATCH_RETRY_DELAY_MS;
    error.deferRetry = true;
    error.partitionId = operation?.partitionId || null;
    return error;
  }
}

export {OperationWorkflowTransitionOrchestration};
