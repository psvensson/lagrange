import { OPERATION_WORKFLOW_OWNER_SHARED } from "./operation-workflow-owner-shared.js";
import { OperationWorkflowOwnerSegment2 } from "./operation-workflow-owner-segment-2.js";

const {
  AUTHORITATIVE_TRANSITION_RECOVERY_STATUS,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
  ControlPlaneField,
  ControlPlaneMessageType,
  ControlPlaneReadinessService,
  DEFAULT_MIN_REPLICA_COUNT,
  DIRECT_TRANSITION_PERSIST_PARTITION_IDS,
  DISPATCH_RETRY_DELAY_MS,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
  EXECUTOR_OUTCOME_FIELD,
  FAILURE_LOG_LEVEL,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INITIAL_PARTITION_IDS,
  METRICS_LOG_TAG,
  NUM,
  OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES,
  OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_HANDLER,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_METADATA_KEY,
  OPERATION_OWNER_ACTION,
  OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR,
  OPERATION_SINGLE_FLIGHT_SCOPE,
  OPERATION_TRANSITION_REASON,
  OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  OperationType,
  PARTITION_SERVICE_ERROR_MSG,
  PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
  PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE,
  QUERY_ERROR_MSG,
  RAFT_ROLE,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECOVERABLE_TRANSITION_COMMIT_STATUS,
  RECOVERABLE_TRANSITION_ROLLBACK_STATUS,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REMOVE_SAFETY_READ_QUERY_OPTIONS,
  REMOVE_SAFETY_SQL,
  REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SAFETY_DEFERRED_LOG_THROTTLE_MS,
  SAFETY_DEFERRED_RETRY_DELAY_MS,
  SERVICE_TYPE,
  SQL_RECONCILIATION_REASON,
  SYSTEM_TABLE_NAME,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TIME_MS,
  TRANSACTION_STATUS,
  TRANSITION_RECOVERY_READ_OPTIONS,
  TRANSITION_RECOVERY_SQL,
  TRANSITION_RETRY_DELAY_MS,
  TRANSITION_STEP_OPTIONS,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  WORKFLOW_STEP_TO_STATUS,
  buildControlPlaneQueryOptions,
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryOperationAssessment,
  buildSelectRowsByTransactionIdsSql,
  buildTimeoutClassification,
  classifyTransportDeliveryOutcome,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
  getControlPlaneRetryAfterMs,
  getWorkflowSteps,
  hasPriorityRecoverySpreadGap,
  isCoordinatorOwnedOperationType,
  isDeliveredTransportDeliveryOutcome,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  isSystemTablePartition,
  normalizeNodeIdList,
  normalizeReplicaRowNodeIds,
  readAuthoritativeControlPlaneRows,
  resolvePriorityRecoveryActiveNodeCohort,
} = OPERATION_WORKFLOW_OWNER_SHARED;

class OperationWorkflowOwnerSegment3 extends OperationWorkflowOwnerSegment2 {
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
        controlPlaneOperationKind: "read",
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
          controlPlaneOperationKind: "read",
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
          typeof options.afterCommit === TYPEOF.FUNCTION
            ? options.afterCommit
            : null;
        if (options?.bypassExecutionTransaction === true) {
          await this.operationWorkflowCoordinator.transitionStep(
            operation.operationId,
            { nextStep: step, reason },
            {},
            TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
          );
          await persistFn(null);
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
            { nextStep: step, reason },
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
              typeof txCoordinator.getTransaction === TYPEOF.FUNCTION
                ? txCoordinator.getTransaction(sessionId)
                : null;
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
      { operation },
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
    const targetReadiness = targetNodeId
      ? this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, {
          decisionDimension: readinessDecisionDimension,
        })
      : null;
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
        ...(Array.isArray(operation.stepsHistory)
          ? operation.stepsHistory
          : []),
        stepEntry,
      ],
    };
    const projectIdempotentTransition = () => {
      operation.workflowStep = step;
      operation.status = persistedStatus;
      const previousUpdatedAt = Number(operation.updatedAt);
      operation.updatedAt = Number.isFinite(previousUpdatedAt)
        ? Math.max(previousUpdatedAt, now)
        : now;
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
    const partitionId = String(operation?.partitionId || "").trim();
    return (
      partitionId.length > NUM.ZERO &&
      operation?.workflowStep === WORKFLOW_STEP.PENDING &&
      isPriorityControlPlanePartition({ partitionId })
    );
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
      "control_plane_pressure_degraded while claiming priority " +
        "dispatch transition",
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
        const targetReadiness = targetNodeId
          ? this.controlPlaneReadinessService.getNodeReadinessSync(
              targetNodeId,
              {
                decisionDimension: readinessDecisionDimension,
              },
            )
          : null;
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
            ...(Array.isArray(operation.stepsHistory)
              ? operation.stepsHistory
              : []),
            stepEntry,
          ],
        };
        const commitProjectedState = (nextOperation) => {
          nextOperation.workflowStep = step;
          nextOperation.updatedAt = now;
          nextOperation.status = persistedStatus;
          nextOperation.stepsHistory = projectedOperation.stepsHistory;
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
          { nextStep: step, reason: transitionReason },
          {},
          TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
        );

        const transitionCommitted =
          await this.repository.persistOperationUpdate(projectedOperation, {
            confirmPersistence: true,
            expectedWorkflowStep: WORKFLOW_STEP.PENDING,
          });

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
      { operation },
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
      operation.type === OperationType.ADD
        ? WORKFLOW_STEP.ACTIVE
        : WORKFLOW_STEP.REMOVED;
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
    const targetReadiness = targetNodeId
      ? this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, {
          decisionDimension: readinessDecisionDimension,
        })
      : null;
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
        ...(Array.isArray(operation.stepsHistory)
          ? operation.stepsHistory
          : []),
        stepEntry,
      ],
    };
    const projectIdempotentTransition = () => {
      operation.workflowStep = finalStep;
      operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
      const previousUpdatedAt = Number(operation.updatedAt);
      operation.updatedAt = Number.isFinite(previousUpdatedAt)
        ? Math.max(previousUpdatedAt, now)
        : now;
      const previousCompletedAt = Number(operation.completedAt);
      operation.completedAt = Number.isFinite(previousCompletedAt)
        ? Math.max(previousCompletedAt, now)
        : now;
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
      "Unknown error",
    );
    const isSafetyBlocked = this.isSafetyPolicyFailure(normalizedError);
    const logLevel =
      options.logLevel ||
      (isSafetyBlocked ? FAILURE_LOG_LEVEL.WARN : FAILURE_LOG_LEVEL.ERROR);
    const logMessage =
      options.logMessage ||
      (isSafetyBlocked
        ? REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY
        : REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED);
    const previousStep = operation.workflowStep;
    const transitionReason = isSafetyBlocked
      ? OPERATION_TRANSITION_REASON.SAFETY_POLICY_BLOCKED
      : OPERATION_TRANSITION_REASON.OPERATION_FAILED;
    const readinessDecisionDimension =
      this.resolveOperationReadinessDecisionDimension(operation);

    const targetNodeId = operation.targetNodeId;
    const targetReadiness = targetNodeId
      ? this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, {
          decisionDimension: readinessDecisionDimension,
        })
      : null;
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
        ...(Array.isArray(operation.stepsHistory)
          ? operation.stepsHistory
          : []),
        failedStepEntry,
      ],
    };
    const projectIdempotentTransition = () => {
      operation.workflowStep = WORKFLOW_STEP.FAILED;
      operation.status = ReplicaStatus.FAILED;
      const previousUpdatedAt = Number(operation.updatedAt);
      operation.updatedAt = Number.isFinite(previousUpdatedAt)
        ? Math.max(previousUpdatedAt, now)
        : now;
      const previousCompletedAt = Number(operation.completedAt);
      operation.completedAt = Number.isFinite(previousCompletedAt)
        ? Math.max(previousCompletedAt, now)
        : now;
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
      typeof this.logger.warn === "function"
        ? this.logger.warn.bind(this.logger)
        : this.logger.error.bind(this.logger);

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

  // --- Claim / dispatch / execution ---

  /**
   * Claim one pending operation for dispatch progression.
   * Uses the narrow priority CAS path only when needed and otherwise
   * reuses the canonical transition owner update path.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
}

export { OperationWorkflowOwnerSegment3 };
