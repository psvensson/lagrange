import {OperationWorkflowRecoveryObservation} from './operation-workflow-recovery-observation.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';

const {
  ACTIVE_REPLACE_SOURCE_RETIREMENT_BLOCKING_STATUSES,
  NUM,
  OBSERVED_OPERATION_ROW_TARGET_PROGRESS_STATUSES,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECONCILED_REPLICA_STATUS_ABSENT_VALUES,
  RECONCILED_REPLICA_STATUS_AUTHORITATIVE_TERMINAL_STATUSES,
  RECONCILED_REPLICA_STATUS_PROGRESS_RANK_BY_STATUS,
  RECONCILED_REPLICA_STATUS_PROGRESS_RANK_UNAVAILABLE,
  RECONCILED_REPLICA_STATUS_RESOLUTION_STATE,
  RECONCILED_REPLICA_STATUS_RESOLUTION_TABLE,
  RECONCILED_REPLICA_STATUS_TERMINAL_CACHE_BLOCKING_STATUSES,
  ReplicaStatus,
  SQL_RECONCILIATION_REASON,
  STOPPING_REPLICA_OBSERVATION_STATE,
  TARGET_CREATE_ADMISSION_WORKFLOW_STEPS_BY_STATUS,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TIMEOUT_RECONCILE_OPERATION_SELECTION_ACTION,
  TIMEOUT_RECONCILE_OPERATION_SELECTION_ACTION_BY_STATE,
  TIMEOUT_RECONCILE_OPERATION_SELECTION_STATE,
  TIMEOUT_RECONCILE_OPERATION_SELECTION_STATE_TABLE,
  TYPEOF,
  WORKFLOW_STEP,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
  isPriorityControlPlanePartition,
} = SHARED;

class OperationWorkflowRecoveryStatusReconcile extends OperationWorkflowRecoveryObservation {
  isActiveReplaceSourceRetirementObserved(
    operation,
    sourceReplicaId,
    sourceObservation,
  ) {
    if (sourceObservation?.lifecycleStatus === ReplicaStatus.FAILED) {
      return true;
    }
    if (
      sourceObservation?.state !== STOPPING_REPLICA_OBSERVATION_STATE.ABSENT
    ) {
      return false;
    }
    return !this.isActiveReplaceSourceReplicaVisibleInCache(
      operation,
      sourceReplicaId,
    );
  }

  isActiveReplaceSourceReplicaVisibleInCache(operation, sourceReplicaId) {
    if (
      !this.repository ||
      typeof this.repository.getObservedReplicaRowFromCache !== TYPEOF.FUNCTION
    ) {
      return false;
    }
    const sourceReplicaRow = this.repository.getObservedReplicaRowFromCache(
      sourceReplicaId,
      operation.partitionId,
      operation.sourceNodeId,
      {
        allowPartitionNodeFallback: false,
      },
    );
    if (!sourceReplicaRow) {
      return false;
    }
    const sourceReplicaStatus =
      typeof this.repository.normalizeObservedReplicaLifecycle ===
        TYPEOF.FUNCTION ?
        this.repository.normalizeObservedReplicaLifecycle(sourceReplicaRow) :
        sourceReplicaRow.status;
    return ACTIVE_REPLACE_SOURCE_RETIREMENT_BLOCKING_STATUSES.has(
      sourceReplicaStatus,
    );
  }

  isTargetCreateAdmissionProgress(operation, actualStatus) {
    const workflowSteps =
      TARGET_CREATE_ADMISSION_WORKFLOW_STEPS_BY_STATUS.get(actualStatus);
    return Boolean(workflowSteps?.has(operation?.workflowStep));
  }

  async applyReconciledReplicaStatus(operation, actualStatus, options = {}) {
    const cause = options.cause || 'progress';
    const reconciledStatus = this.resolveReconciledReplicaStatus(
      operation,
      actualStatus,
    );

    if (this.isTargetCreateAdmissionProgress(operation, reconciledStatus)) {
      await this.updateStep(operation, WORKFLOW_STEP.CREATING);
      return true;
    }

    if (
      this.shouldRearmDispatchFromProgressReconcile(
        operation,
        reconciledStatus,
        options,
      )
    ) {
      const operationId = String(
        operation?.operationId ||
          OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
      ).trim();
      if (!this.repository.isOperationLocallyOwned(operation)) {
        if (
          operationId.length > NUM.ZERO &&
          this.hasActiveCreatedOperationHandoffRetry(operationId)
        ) {
          return true;
        }
        const remoteOwnerWoken =
          await this.wakeCoordinatorCreatedRemoteOwner(operation);
        return (
          remoteOwnerWoken === true ||
          (
            operationId.length > NUM.ZERO &&
            this.hasActiveCreatedOperationHandoffRetry(operationId)
          )
        );
      }
      await this.executeOperationFromReconcilePath(operation);
      return true;
    }

    if (
      reconciledStatus === ReplicaStatus.SYNCING &&
      (operation.workflowStep === WORKFLOW_STEP.PENDING ||
        operation.workflowStep === WORKFLOW_STEP.SENDING ||
        operation.workflowStep === WORKFLOW_STEP.CREATING)
    ) {
      await this.updateStep(operation, WORKFLOW_STEP.SYNCING);
      return true;
    }

    if (reconciledStatus === ReplicaStatus.REMOVED) {
      if (operation.type !== OperationType.ADD) {
        await this.completeOperation(operation);
      } else {
        await this.failOperation(
          operation,
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_OPERATION_RECONCILIATION,
        );
      }
      return true;
    }

    if (reconciledStatus === ReplicaStatus.ACTIVE) {
      if (operation.type === OperationType.REPLACE) {
        await this.reconcileReplaceActualActive(operation);
      } else {
        await this.completeOperation(operation);
      }
      return true;
    }

    if (reconciledStatus === ReplicaStatus.FAILED) {
      await this.failOperation(
        operation,
        cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
          operation.workflowStep === WORKFLOW_STEP.SYNCING ?
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_SYNC :
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_OPERATION_RECONCILIATION,
      );
      return true;
    }

    if (
      reconciledStatus === null &&
      cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
      operation.workflowStep === WORKFLOW_STEP.SYNCING
    ) {
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_NOT_FOUND_DURING_RECOVERY_RECONCILIATION,
      );
      return true;
    }

    return false;
  }

  buildReconciledReplicaStatusEvidence(operation, actualStatus) {
    const observedTargetStatus =
      this.getObservedOperationRowTargetProgressStatus(operation);
    const actualStatusRank =
      RECONCILED_REPLICA_STATUS_PROGRESS_RANK_BY_STATUS.get(actualStatus) ||
      RECONCILED_REPLICA_STATUS_PROGRESS_RANK_UNAVAILABLE;
    const observedTargetStatusRank =
      RECONCILED_REPLICA_STATUS_PROGRESS_RANK_BY_STATUS.get(
        observedTargetStatus,
      ) ||
      RECONCILED_REPLICA_STATUS_PROGRESS_RANK_UNAVAILABLE;
    const observedTargetTerminalCacheBlocker =
      RECONCILED_REPLICA_STATUS_TERMINAL_CACHE_BLOCKING_STATUSES.has(
        observedTargetStatus,
      );
    const authoritativeTerminalStatus =
      RECONCILED_REPLICA_STATUS_AUTHORITATIVE_TERMINAL_STATUSES.has(
        actualStatus,
      );
    return Object.freeze({
      actualStatus,
      observedTargetStatus,
      actualStatusAbsent:
        RECONCILED_REPLICA_STATUS_ABSENT_VALUES.has(actualStatus),
      observedTargetProgress:
        OBSERVED_OPERATION_ROW_TARGET_PROGRESS_STATUSES.has(
          observedTargetStatus,
        ),
      actualStatusRank,
      observedTargetStatusRank,
      observedTargetTerminalCacheBlocker,
      authoritativeTerminalStatus,
      observedTargetAheadOfActual:
        authoritativeTerminalStatus !== true &&
        observedTargetTerminalCacheBlocker !== true &&
        observedTargetStatusRank > actualStatusRank,
    });
  }

  resolveReconciledReplicaStatusResolutionState(evidence) {
    return (
      RECONCILED_REPLICA_STATUS_RESOLUTION_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      RECONCILED_REPLICA_STATUS_RESOLUTION_STATE.AUTHORITATIVE
    );
  }

  resolveReconciledReplicaStatus(operation, actualStatus) {
    const evidence = this.buildReconciledReplicaStatusEvidence(
      operation,
      actualStatus,
    );
    const resolutionState =
      this.resolveReconciledReplicaStatusResolutionState(evidence);
    if (
      resolutionState ===
      RECONCILED_REPLICA_STATUS_RESOLUTION_STATE.OBSERVED_TARGET_CACHE
    ) {
      return evidence.observedTargetStatus;
    }
    return evidence.actualStatus;
  }

  async reconcileOperationLifecycle(operation, options = {}) {
    if (!operation) {
      return false;
    }
    const priorityRecoveryDrainSnapshot =
      await this.buildPriorityRecoveryOperationDrainSnapshot(operation);
    if (
      await this.reconcilePriorityRecoveryOperationDrain(
        operation,
        priorityRecoveryDrainSnapshot,
      )
    ) {
      return true;
    }
    if (
      !this.shouldEnterOperationLifecycleFromDrainSnapshot(
        priorityRecoveryDrainSnapshot,
      )
    ) {
      return false;
    }

    const cause = options.cause || 'progress';
    const lifecycleAction = this.resolveOperationLifecycleAction(
      operation,
      cause,
    );
    switch (lifecycleAction) {
    case OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY:
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_OPERATION,
      );
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, {
        operationId: operation.operationId,
        workflowStep: operation.workflowStep,
        partitionId: operation.partitionId,
      });
      return true;
    case OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY:
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_REMOVAL_OPERATION,
      );
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_REMOVE_FAILED,
        {
          operationId: operation.operationId,
          workflowStep: operation.workflowStep,
          partitionId: operation.partitionId,
        },
      );
      return true;
    case OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE: {
      if (await this.reconcileActiveReplaceSourceRemovalProgress(operation)) {
        return true;
      }
      const activeReplaceResumeResult =
        await this.executeOperationFromReconcilePath(operation);
      if (activeReplaceResumeResult?.skipped === true) {
        this.ensurePriorityActiveReplaceRetryArmed(operation);
      }
      return true;
    }
    case OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH:
      await this.executeOperationFromReconcilePath(operation);
      return true;
    case OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING:
      return this.reconcileStoppingOperationProgress(operation);
    case OPERATION_LIFECYCLE_ACTION.NOOP:
      return false;
    case OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS:
    default:
      break;
    }

    const actualStatus = await this.getReconciledReplicaStatus(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
    );
    if (cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY) {
      this.repository.emitReplicaStatusDivergence(
        operation.replicaId,
        actualStatus,
        SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
      );
    }
    return this.applyReconciledReplicaStatus(operation, actualStatus, {
      cause,
    });
  }

  async reconcileOperationProgress(operation, options = {}) {
    return this.reconcileOperationLifecycle(operation, options);
  }

  async reconcileObservedTargetProgressDuringTransitionGrace(operation, now) {
    if (!this.hasObservedOperationRowTargetProgress(operation)) {
      return false;
    }
    return this.reconcileOperationProgress(operation, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
      now,
    });
  }

  getTimeoutForStep(step, operation = null) {
    switch (step) {
    case WORKFLOW_STEP.PENDING:
    case WORKFLOW_STEP.SENDING:
      return this.config.pendingTimeoutMs;
    case WORKFLOW_STEP.CREATING:
      return this.config.creatingTimeoutMs;
    case WORKFLOW_STEP.SYNCING: {
      const configuredTimeout = this.config.syncingTimeoutMs;
      const partitionId = operation?.partitionId || null;
      if (!isPriorityControlPlanePartition({partitionId})) {
        return configuredTimeout;
      }
      return Math.max(
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        Math.min(
          configuredTimeout,
          PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
        ),
      );
    }
    case WORKFLOW_STEP.STOPPING:
      return this.config.removingTimeoutMs;
    default:
      return this.config.pendingTimeoutMs;
    }
  }

  buildTimeoutReconcileOperationSelectionEvidence(
    visibilityOperation,
    fallbackOperation,
  ) {
    const visibilityOperationId = String(
      visibilityOperation?.operationId || '',
    ).trim();
    const fallbackOperationId = String(
      fallbackOperation?.operationId || '',
    ).trim();
    const hasVisibilityOperation =
      visibilityOperationId.length > NUM.ZERO &&
      visibilityOperation &&
      typeof visibilityOperation === TYPEOF.OBJECT;
    const hasFallbackOperation =
      fallbackOperationId.length > NUM.ZERO &&
      fallbackOperation &&
      typeof fallbackOperation === TYPEOF.OBJECT;
    const visibilityWorkflowRank =
      hasVisibilityOperation ?
        this.getOperationWorkflowStepRank(visibilityOperation) :
        NUM.NEGATIVE_ONE;
    const fallbackWorkflowRank =
      hasFallbackOperation ?
        this.getOperationWorkflowStepRank(fallbackOperation) :
        NUM.NEGATIVE_ONE;
    const visibilityUpdatedAt = Number(visibilityOperation?.updatedAt);
    const fallbackUpdatedAt = Number(fallbackOperation?.updatedAt);
    const fallbackWorkflowRankAhead =
      hasVisibilityOperation &&
      hasFallbackOperation &&
      fallbackWorkflowRank > visibilityWorkflowRank;
    const fallbackUpdatedAtAhead =
      hasVisibilityOperation &&
      hasFallbackOperation &&
      fallbackWorkflowRank === visibilityWorkflowRank &&
      Number.isFinite(fallbackUpdatedAt) &&
      (
        !Number.isFinite(visibilityUpdatedAt) ||
        fallbackUpdatedAt > visibilityUpdatedAt
      );

    return Object.freeze({
      hasVisibilityOperation,
      hasFallbackOperation,
      sameOperationId:
        hasVisibilityOperation &&
        hasFallbackOperation &&
        visibilityOperationId === fallbackOperationId,
      visibilityTerminal:
        hasVisibilityOperation &&
        this.repository.isOperationTerminal(visibilityOperation),
      fallbackTerminal:
        hasFallbackOperation &&
        this.repository.isOperationTerminal(fallbackOperation),
      fallbackWorkflowRankAhead,
      fallbackUpdatedAtAhead,
    });
  }

  resolveTimeoutReconcileOperationSelectionAction(
    visibilityOperation,
    fallbackOperation,
  ) {
    const evidence = this.buildTimeoutReconcileOperationSelectionEvidence(
      visibilityOperation,
      fallbackOperation,
    );
    const state =
      TIMEOUT_RECONCILE_OPERATION_SELECTION_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      TIMEOUT_RECONCILE_OPERATION_SELECTION_STATE.VISIBILITY_CURRENT;
    return (
      TIMEOUT_RECONCILE_OPERATION_SELECTION_ACTION_BY_STATE[state] ||
      TIMEOUT_RECONCILE_OPERATION_SELECTION_ACTION.USE_NONE
    );
  }

  selectTimeoutReconcileOperation(
    visibilityObservation,
    fallbackOperation,
  ) {
    const visibilityOperation = visibilityObservation?.operation || null;
    const action = this.resolveTimeoutReconcileOperationSelectionAction(
      visibilityOperation,
      fallbackOperation,
    );
    if (
      action ===
      TIMEOUT_RECONCILE_OPERATION_SELECTION_ACTION.USE_FALLBACK
    ) {
      return fallbackOperation || null;
    }
    if (
      action ===
      TIMEOUT_RECONCILE_OPERATION_SELECTION_ACTION.USE_VISIBILITY
    ) {
      return visibilityOperation || null;
    }
    return null;
  }

  async reconcileTimeoutOperation(operation, now) {
    if (
      this.hasActiveTransitionRetryGrace(operation?.operationId || null, now)
    ) {
      if (
        await this.reconcileObservedTargetProgressDuringTransitionGrace(
          operation,
          now,
        )
      ) {
        return;
      }
      if (await this.reconcilePriorityRecoveryOperationDrain(operation)) {
        return;
      }
      return;
    }
    const progressed = await this.reconcileOperationProgress(operation, {
      cause: 'timeout',
      now,
    });
    if (progressed) {
      return;
    }

    const startedAtMs =
      operation.createdAt ??
      operation.createdAtMs ??
      operation.updatedAt ??
      operation.updatedAtMs;

    const operationBudget = createTopLevelOperationBudget({
      configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
      operationName: 'rebalance',
      startedAtMs,
      now: () => now,
    });

    const stepTimeout = this.getTimeoutForStep(
      operation.workflowStep,
      operation,
    );
    const stepAllocation = createChildTimeoutBudget(operationBudget, {
      requestedBudgetMs: stepTimeout,
      minimumBudgetMs: TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
      nestedOperation: `rebalance:${String(
        operation.workflowStep || 'unknown',
      ).toLowerCase()}`,
      now: () => now,
    });

    // Report time-in-current-step (the anchor isOperationStepTimedOut now uses),
    // not time-since-updatedAt, so the timeout log/message is not under-reported
    // for an op whose dispatch retry loop kept re-stamping updatedAt (CL-044).
    const elapsedAnchorMs = this.resolveOperationStepEnteredAtMs?.(operation);
    const elapsed = now - (Number.isFinite(elapsedAnchorMs) ?
      elapsedAnchorMs :
      (operation.updatedAt ?? operation.updatedAtMs));
    const stepExceeded = this.isOperationStepTimedOut(operation, now);
    const budgetExhausted = !stepAllocation.allowed;

    if (stepExceeded || budgetExhausted) {
      const timeoutClassification = budgetExhausted ?
        stepAllocation.timeoutClassification :
        buildTimeoutClassification({
          budget: operationBudget,
          classification:
              TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
          nestedOperation: `rebalance:${String(
            operation.workflowStep || 'unknown',
          ).toLowerCase()}`,
          now: () => now,
        });

      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TIMED_OUT, {
        operationId: operation.operationId,
        workflowStep: operation.workflowStep,
        elapsed,
        timeout: stepTimeout,
        budgetExhausted,
        timeoutClassification,
      });

      await this.failOperation(
        operation,
        `Timeout in ${operation.workflowStep} step ` + `after ${elapsed}ms`,
        {
          stepMetadata: {
            timeoutClassification,
            timeoutMs: stepTimeout,
            elapsedMs: elapsed,
            timedOutAtMs: now,
            budgetExhausted,
          },
        },
      );

      this.stats.operationsTimedOut++;
    }
  }
}

export {OperationWorkflowRecoveryStatusReconcile};
