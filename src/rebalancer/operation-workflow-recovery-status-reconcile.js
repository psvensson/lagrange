import {PRE_SYNC_WORKFLOW_STEPS} from './replica-operation-step-policy.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {OperationWorkflowRecoveryObservation} from './operation-workflow-recovery-observation.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';
import {runtimeServiceReplicaBelongsToEntity} from './runtime-service-replica-identity.js';
import {assertCanonicalRebalancerEntityIdentity} from './rebalancer-entity-identity.js';
import {
  REPLACE_TARGET_DEAD_BEFORE_INTENT, REPLACE_TARGET_REMOVED_BEFORE_ACTIVE,
  isPartitionReplace, isReplaceExemptFromTimeBudget, isReplacePromotionInLog,
  isReplaceRemovalIntentDurable, recordReplaceBudgetDiagnostic,
} from './operation-workflow-replace-owner.js';
import {observedReplaceTargetStatus} from './operation-workflow-replace-surviving-membership.js';
import {OPERATION_RECONCILE_OUTCOME, didOperationReconcileAdvanceOrComplete} from './operation-workflow-growth-promote.js';
import {isTerminalTransitionOutcomeSettled} from './operation-workflow-terminal-reservation-release.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from './replica-operation-update-disposition.js';
const {
  ACTIVE_REPLACE_SOURCE_RETIREMENT_BLOCKING_STATUSES,
  OBSERVED_OPERATION_ROW_TARGET_PROGRESS_STATUSES, OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL, OperationType,
  PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS, REBALANCE_COORDINATOR_LOG_MSG,
  RECONCILED_REPLICA_STATUS_ABSENT_VALUES,
  RECONCILED_REPLICA_STATUS_AUTHORITATIVE_TERMINAL_STATUSES,
  RECONCILED_REPLICA_STATUS_PROGRESS_RANK_BY_STATUS,
  RECONCILED_REPLICA_STATUS_PROGRESS_RANK_UNAVAILABLE,
  RECONCILED_REPLICA_STATUS_RESOLUTION_STATE,
  RECONCILED_REPLICA_STATUS_RESOLUTION_TABLE,
  RECONCILED_REPLICA_STATUS_TERMINAL_CACHE_BLOCKING_STATUSES,
  ReplicaOperationResponseStatus, ReplicaStatus, SQL_RECONCILIATION_REASON,
  STOPPING_REPLICA_OBSERVATION_STATE, SYSTEM_TABLE_NAME,
  TARGET_CREATE_ADMISSION_WORKFLOW_STEPS_BY_STATUS,
  TIMEOUT_BUDGET_CLASSIFICATION, TIMEOUT_BUDGET_DEFAULT,
  TIMEOUT_RECONCILE_OPERATION_SELECTION_ACTION,
  TIMEOUT_RECONCILE_OPERATION_SELECTION_ACTION_BY_STATE,
  TIMEOUT_RECONCILE_OPERATION_SELECTION_STATE,
  TIMEOUT_RECONCILE_OPERATION_SELECTION_STATE_TABLE, UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP, buildTimeoutClassification, classifySystemPartition,
  createChildTimeoutBudget, createTopLevelOperationBudget,
} = SHARED;

async function reconcilePartitionReplaceTargetStatus(owner, operation, status) {
  const targetGone = status === ReplicaStatus.REMOVED;
  if (!isPartitionReplace(operation) || (!targetGone && status !== ReplicaStatus.FAILED)) {
    return false;
  }
  if (isReplaceRemovalIntentDurable(operation) || isReplacePromotionInLog(operation)) {
    await owner.runReplaceStoppingOwner(operation);
    return true;
  }
  await owner.failOperation(operation, targetGone ?
    REPLACE_TARGET_REMOVED_BEFORE_ACTIVE : REPLACE_TARGET_DEAD_BEFORE_INTENT);
  return true;
}

const OPERATION_STEP_TIMEOUT_WAIT = Object.freeze({
  wait: 'REBALANCE_OPERATION_STEP_TIMEOUT',
  awaited: 'replica operation progressed past its current workflow step',
});

function reportOperationStepTimeoutSpent(owner, operation, spent) {
  reportWaitBoundSpent(owner.logger, {
    ...OPERATION_STEP_TIMEOUT_WAIT,
    boundMs: spent.stepTimeout,
    elapsedMs: spent.elapsed,
    lastObserved: {
      type: operation.type || null, workflowStep: operation.workflowStep,
      status: operation.status, targetNodeId: operation.targetNodeId || null,
      stepExceeded: spent.stepExceeded, budgetExhausted: spent.budgetExhausted,
      timeoutClassification: spent.timeoutClassification || null,
    },
    scope: {
      nodeId: owner.nodeId || null, partitionId: operation.partitionId || null,
      operationId: operation.operationId || null,
    },
    subject: operation.operationId || null,
  });
}

function classifyTerminalPersistOutcome(_owner, _operation, outcome) {
  if (isTerminalTransitionOutcomeSettled(outcome)) {
    return OPERATION_RECONCILE_OUTCOME.COMPLETED;
  }
  return outcome?.disposition === REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED ?
    OPERATION_RECONCILE_OUTCOME.REFUSED : OPERATION_RECONCILE_OUTCOME.WAITING;
}

function classifyReconcileExecutionOutcome(owner, operation, previousStep, executionResult = null) {
  if (owner.repository?.isOperationTerminal?.(operation) === true ||
      executionResult?.status === ReplicaOperationResponseStatus.COMPLETED) {
    return OPERATION_RECONCILE_OUTCOME.COMPLETED;
  }
  if (executionResult?.skipped === true) return OPERATION_RECONCILE_OUTCOME.WAITING;
  if (previousStep !== null && previousStep !== undefined &&
      operation?.workflowStep !== previousStep) {
    return OPERATION_RECONCILE_OUTCOME.ADVANCED;
  }
  return OPERATION_RECONCILE_OUTCOME.WAITING;
}

class OperationWorkflowRecoveryStatusReconcile extends OperationWorkflowRecoveryObservation {
  isRuntimeServiceActiveCacheHandoffAligned(operation) {
    if (
      operation?.entityType !== UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE ||
      typeof this.repository?.getObservedReplicaStatusFromCache !==
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION
    ) {
      return false;
    }
    return this.repository.getObservedReplicaStatusFromCache(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
    ) === ReplicaStatus.ACTIVE;
  }

  async confirmActiveReplicaTerminalHandoff(operation, options = {}) {
    if (
      operation?.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
      !runtimeServiceReplicaBelongsToEntity(
        operation.replicaId,
        operation.entityId,
      )
    ) {
      await this.failOperation(
        operation,
        'Runtime-service replacement target has non-canonical identity',
      );
      return false;
    }
    if (this.isRuntimeServiceActiveCacheHandoffAligned(operation)) return true;
    let cacheAligned = false;
    if (
      operation?.replicaId &&
      this.repository &&
      typeof this.repository.refreshAuthoritativeReplicaCacheRow ===
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION
    ) {
      cacheAligned =
        await this.repository.refreshAuthoritativeReplicaCacheRow(
          operation.replicaId,
          operation.targetNodeId,
        );
    }
    if (
      cacheAligned === true &&
      (
        operation?.entityType !== UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE ||
        this.isRuntimeServiceActiveCacheHandoffAligned(operation)
      )
    ) {
      return true;
    }
    if (options.scheduleObservedProgressRetry !== false) {
      this.scheduleObservedProgressRetry(
        operation.operationId,
        SYSTEM_TABLE_NAME.SERVICES,
        OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT,
      );
    }
    return false;
  }

  async reconcileActiveReplicaStatus(operation) {
    if (!await this.confirmActiveReplicaTerminalHandoff(operation)) {
      return OPERATION_RECONCILE_OUTCOME.WAITING;
    }
    if (operation.type === OperationType.REPLACE) {
      const previousStep = operation.workflowStep;
      const replaceProgressApplied =
        await this.reconcileReplaceActualActive(operation);
      if (replaceProgressApplied === true) {
        this.clearObservedProgressRetry(operation.operationId, {
          includeDeliveredCreateProgress: true,
        });
        return this.repository?.isOperationTerminal?.(operation) === true ?
          OPERATION_RECONCILE_OUTCOME.COMPLETED :
          OPERATION_RECONCILE_OUTCOME.ADVANCED;
      }
      return classifyReconcileExecutionOutcome(this, operation, previousStep);
    }
    return classifyTerminalPersistOutcome(this, operation,
      await this.completeOperation(operation));
  }

  isActiveReplaceSourceRetirementObserved(
    operation,
    sourceReplicaId,
    sourceObservation,
  ) {
    if (
      sourceObservation?.lifecycleStatus === ReplicaStatus.FAILED &&
      operation?.entityType !== UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE
    ) {
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
      typeof this.repository.getObservedReplicaRowFromCache !== 'function'
    ) {
      return false;
    }
    const sourceReplicaRow = this.repository.getObservedReplicaRowFromCache(
      sourceReplicaId,
      operation.partitionId,
      operation.sourceNodeId,
    );
    if (!sourceReplicaRow) {
      return false;
    }
    const sourceReplicaStatus =
      typeof this.repository.normalizeObservedReplicaLifecycle ===
        'function' ?
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
    const previousStep = operation?.workflowStep;

    if (await reconcilePartitionReplaceTargetStatus(
      this, operation, reconciledStatus)) {
      return classifyReconcileExecutionOutcome(this, operation, previousStep);
    }

    if (this.isTargetCreateAdmissionProgress(operation, reconciledStatus)) {
      await this.updateStep(operation, WORKFLOW_STEP.CREATING);
      return OPERATION_RECONCILE_OUTCOME.ADVANCED;
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
          operationId.length > 0 &&
          this.hasActiveCreatedOperationHandoffRetry(operationId)
        ) {
          return OPERATION_RECONCILE_OUTCOME.WAITING;
        }
        const remoteOwnerWoken =
          await this.wakeCoordinatorCreatedRemoteOwner(operation);
        return (
          remoteOwnerWoken === true ||
          (
            operationId.length > 0 &&
            this.hasActiveCreatedOperationHandoffRetry(operationId)
          )
        ) ?
          OPERATION_RECONCILE_OUTCOME.WAITING :
          OPERATION_RECONCILE_OUTCOME.REFUSED;
      }
      const executionResult =
        await this.executeOperationFromReconcilePath(operation);
      return classifyReconcileExecutionOutcome(
        this,
        operation,
        previousStep,
        executionResult,
      );
    }

    if (
      reconciledStatus === ReplicaStatus.SYNCING &&
      PRE_SYNC_WORKFLOW_STEPS.has(operation.workflowStep)
    ) {
      await this.updateStep(operation, WORKFLOW_STEP.SYNCING);
      return OPERATION_RECONCILE_OUTCOME.ADVANCED;
    }

    if (reconciledStatus === ReplicaStatus.REMOVED) {
      const outcome = operation.type !== OperationType.ADD ?
        await this.completeOperation(operation) :
        await this.failOperation(
          operation,
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_OPERATION_RECONCILIATION,
        );
      return classifyTerminalPersistOutcome(this, operation, outcome);
    }

    if (reconciledStatus === ReplicaStatus.ACTIVE) {
      return this.reconcileActiveReplicaStatus(operation);
    }

    if (reconciledStatus === ReplicaStatus.FAILED) {
      const outcome = await this.failOperation(
        operation,
        cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
          operation.workflowStep === WORKFLOW_STEP.SYNCING ?
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_SYNC :
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_OPERATION_RECONCILIATION,
      );
      return classifyTerminalPersistOutcome(this, operation, outcome);
    }

    if (
      reconciledStatus === null &&
      cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
      operation.workflowStep === WORKFLOW_STEP.SYNCING
    ) {
      const outcome = await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_NOT_FOUND_DURING_RECOVERY_RECONCILIATION,
      );
      return classifyTerminalPersistOutcome(this, operation, outcome);
    }

    return OPERATION_RECONCILE_OUTCOME.WAITING;
  }

  buildReconciledReplicaStatusEvidence(operation, actualStatus) {
    const observedTargetStatus =
      this.getObservedOperationRowTargetProgressStatus(operation);
    const actualStatusRank =
      RECONCILED_REPLICA_STATUS_PROGRESS_RANK_BY_STATUS.get(actualStatus) ||
      RECONCILED_REPLICA_STATUS_PROGRESS_RANK_UNAVAILABLE;
    const observedTargetStatusRank =
      RECONCILED_REPLICA_STATUS_PROGRESS_RANK_BY_STATUS.get(observedTargetStatus) ||
      RECONCILED_REPLICA_STATUS_PROGRESS_RANK_UNAVAILABLE;
    const observedTargetTerminalCacheBlocker =
      RECONCILED_REPLICA_STATUS_TERMINAL_CACHE_BLOCKING_STATUSES.has(observedTargetStatus);
    const authoritativeTerminalStatus =
      RECONCILED_REPLICA_STATUS_AUTHORITATIVE_TERMINAL_STATUSES.has(actualStatus);
    return Object.freeze({
      actualStatus,
      observedTargetStatus,
      actualStatusAbsent: RECONCILED_REPLICA_STATUS_ABSENT_VALUES.has(actualStatus),
      observedTargetProgress:
        OBSERVED_OPERATION_ROW_TARGET_PROGRESS_STATUSES.has(observedTargetStatus),
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
    if (!operation) return OPERATION_RECONCILE_OUTCOME.REFUSED;
    if (operation.status === ReplicaStatus.HELD) return OPERATION_RECONCILE_OUTCOME.HELD;
    const priorityRecoveryDrainSnapshot =
      await this.buildPriorityRecoveryOperationDrainSnapshot(operation);
    if (
      await this.reconcilePriorityRecoveryOperationDrain(
        operation,
        priorityRecoveryDrainSnapshot,
      )
    ) {
      return OPERATION_RECONCILE_OUTCOME.COMPLETED;
    }
    if (
      !this.shouldEnterOperationLifecycleFromDrainSnapshot(
        priorityRecoveryDrainSnapshot,
      )
    ) {
      return OPERATION_RECONCILE_OUTCOME.WAITING;
    }

    const cause = options.cause || 'progress';
    const previousStep = operation.workflowStep;
    const lifecycleAction = this.resolveOperationLifecycleAction(
      operation,
      cause,
    );
    switch (lifecycleAction) {
    case OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY: {
      const outcome = await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_OPERATION,
      );
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, {
        operationId: operation.operationId,
        workflowStep: operation.workflowStep,
        partitionId: operation.partitionId,
      });
      return classifyTerminalPersistOutcome(this, operation, outcome);
    }
    case OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY: {
      if (isReplaceRemovalIntentDurable(operation)) {
        // D2: recovery of a post-intent REPLACE resumes its owner; it never
        // re-enables a timer- or restart-driven FAILED.
        const stoppingResult = await this.runReplaceStoppingOwner(operation);
        return classifyReconcileExecutionOutcome(
          this,
          operation,
          previousStep,
          stoppingResult,
        );
      }
      const outcome = await this.failOperation(
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
      return classifyTerminalPersistOutcome(this, operation, outcome);
    }
    case OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE: {
      if (await reconcilePartitionReplaceTargetStatus(this, operation,
        observedReplaceTargetStatus(this, operation))) {
        return classifyReconcileExecutionOutcome(this, operation, previousStep);
      }
      if (await this.reconcileActiveReplaceSourceRemovalProgress(operation)) {
        return classifyReconcileExecutionOutcome(this, operation, previousStep);
      }
      const resumeRes = await this.executeOperationFromReconcilePath(operation);
      if (resumeRes?.skipped === true) {
        this.ensurePriorityActiveReplaceRetryArmed(operation);
      }
      return classifyReconcileExecutionOutcome(this, operation, previousStep, resumeRes);
    }
    case OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH: {
      const removeDispatchResult = await this.executeOperationFromReconcilePath(operation);
      return classifyReconcileExecutionOutcome(this, operation, previousStep, removeDispatchResult);
    }
    case OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING: {
      const stoppingProgressed = await this.reconcileStoppingOperationProgress(operation);
      if (this.repository?.isOperationTerminal?.(operation) === true) {
        return OPERATION_RECONCILE_OUTCOME.COMPLETED;
      }
      if (operation.workflowStep !== previousStep) {
        return OPERATION_RECONCILE_OUTCOME.ADVANCED;
      }
      return !isReplaceRemovalIntentDurable(operation) &&
        didOperationReconcileAdvanceOrComplete(stoppingProgressed) ?
        OPERATION_RECONCILE_OUTCOME.COMPLETED : OPERATION_RECONCILE_OUTCOME.WAITING;
    }
    case OPERATION_LIFECYCLE_ACTION.NOOP:
      return OPERATION_RECONCILE_OUTCOME.WAITING;
    case OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS:
    default:
      break;
    }

    const {entityType} = assertCanonicalRebalancerEntityIdentity(operation);
    const actualStatus = await this.getReconciledReplicaStatus(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
      {
        entityType,
        ignoreUnclaimedPreRuntimeFailedCreate:
          this.isPreSyncCreateOperation(operation),
        allowActiveLearner: this.isLearnerTargetAddOperation(operation),
      },
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
    return didOperationReconcileAdvanceOrComplete(
      await this.reconcileOperationLifecycle(operation, options),
    );
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
      if (!classifySystemPartition({partitionId}).priorityControlPlane) {
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
      visibilityOperationId.length > 0 &&
      visibilityOperation &&
      typeof visibilityOperation === 'object';
    const hasFallbackOperation =
      fallbackOperationId.length > 0 &&
      fallbackOperation &&
      typeof fallbackOperation === 'object';
    const visibilityWorkflowRank =
      hasVisibilityOperation ?
        this.getOperationWorkflowStepRank(visibilityOperation) :
        -1;
    const fallbackWorkflowRank =
      hasFallbackOperation ?
        this.getOperationWorkflowStepRank(fallbackOperation) :
        -1;
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
        didOperationReconcileAdvanceOrComplete(
          await this.reconcileObservedTargetProgressDuringTransitionGrace(
            operation,
            now,
          ),
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
    if (
      didOperationReconcileAdvanceOrComplete(progressed) ||
      this.repository?.isOperationTerminal?.(operation) === true
    ) {
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
        operation.workflowStep,
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

    if ((stepExceeded || budgetExhausted) &&
        isReplaceExemptFromTimeBudget(operation)) {
      // S9 / D2: the budget is a diagnostic for a REPLACE at ACTIVE or
      // STOPPING; it never changes the operation's state.
      recordReplaceBudgetDiagnostic(this, operation);
      return;
    }
    if (stepExceeded || budgetExhausted) {
      const timeoutClassification = budgetExhausted ?
        stepAllocation.timeoutClassification :
        buildTimeoutClassification({
          budget: operationBudget,
          classification:
              TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
          nestedOperation: `rebalance:${String(
            operation.workflowStep,
          ).toLowerCase()}`,
          now: () => now,
        });

      reportOperationStepTimeoutSpent(this, operation, {
        stepTimeout, elapsed, budgetExhausted, stepExceeded,
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

export {
  OPERATION_RECONCILE_OUTCOME,
  OperationWorkflowRecoveryStatusReconcile,
  didOperationReconcileAdvanceOrComplete,
};
