import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerExecutionLane} from './operation-workflow-owner-execution-lane.js';
import {
  PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS,
  isPriorityOutcomeDeferredLocalProgressCovered,
} from './replica-operation-step-policy.js';

const {
  ControlPlaneReadinessService,
  DISPATCH_RETRY_DELAY_MS,
  INITIAL_PARTITION_IDS,
  OPERATION_METADATA_KEY,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  SYSTEM_TABLE_NAME,
  TIMEOUT_BUDGET_DEFAULT,
  TRANSITION_STEP_OPTIONS,
  WORKFLOW_STEP,
  WORKFLOW_STEP_TO_STATUS,
  classifySystemPartition,
  createTopLevelOperationBudget,
  isRetryableControlPlaneError,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS =
  TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
const PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD =
  'priorityDeferredClaimExpectedStep';

function normalizeOperationWorkflowTransitionStepsHistory(operation) {
  if (Array.isArray(operation?.stepsHistory)) {
    return operation.stepsHistory;
  }
  const rawStepsHistory = operation?.steps_history;
  if (Array.isArray(rawStepsHistory)) {
    return rawStepsHistory;
  }
  if (
    typeof rawStepsHistory === 'string' &&
    rawStepsHistory.length > 0
  ) {
    try {
      const parsedStepsHistory = JSON.parse(rawStepsHistory);
      return Array.isArray(parsedStepsHistory) ? parsedStepsHistory : [];
    } catch {
      return [];
    }
  }
  return [];
}

class OperationWorkflowTransitionOrchestration
  extends OperationWorkflowOwnerExecutionLane {
  /**
   * Execute one guarded durable step mutation under the operation owner lane.
   * SQL owns any post-mirror promotion to a distributed transaction.
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
          if (typeof options.onIdempotentTransition === 'function') {
            options.onIdempotentTransition();
          }
          return false;
        }

        const afterCommit =
          typeof options.afterCommit === 'function' ?
            options.afterCommit :
            null;
        await this.operationWorkflowCoordinator.transitionStep(
          operation.operationId,
          {nextStep: step, reason},
          {},
          TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
        );
        const persistResult = await persistFn();
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
    const currentStepsHistory =
      normalizeOperationWorkflowTransitionStepsHistory(operation);
    const projectedOperation = {
      ...operation,
      workflowStep: step,
      updatedAt: now,
      status: persistedStatus,
      stepsHistory: [
        ...currentStepsHistory,
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
      operation.stepsHistory = currentStepsHistory;
      if (step === WORKFLOW_STEP.CREATING) {
        delete operation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD];
      }
    };

    const usePriorityDispatchTransitionBudget =
      this.shouldUsePriorityDispatchTransitionMutationBudget(operation, step);

    const persistFn = async () => {
      const persistOptions = this.buildOperationTransitionPersistOptions();
      const budgetedPersistOptions =
        usePriorityDispatchTransitionBudget ?
          {
            ...persistOptions,
            timeoutBudget:
              this.buildPriorityDispatchTransitionMutationBudget(
                operation,
                now,
              ),
          } :
          persistOptions;
      const expectedWorkflowStep =
        this.resolveOperationTransitionExpectedWorkflowStep(
          operation,
          previousStep,
          step,
        );
      return this.repository.persistOperationUpdate(
        projectedOperation,
        {...budgetedPersistOptions, expectedWorkflowStep},
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
    operation.stepsHistory = projectedOperation.stepsHistory;
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
      partitionId.length > 0 &&
      operation?.workflowStep === WORKFLOW_STEP.PENDING &&
      classifySystemPartition({partitionId}).priorityControlPlane
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
      partitionId.length > 0 &&
      classifySystemPartition({partitionId}).priorityControlPlane &&
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
        'string' &&
      operation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD].length > 0
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
    return this.isPriorityOutcomeDeferredLocalProgressStep(operation, step);
  }

  /**
   * The executor-outcome-backed transitions of priority control-plane
   * operations: the physical work has already landed (the REPLACE
   * replacement is promoted voter-ready at ACTIVE; the source/subject
   * replica's removal has been dispatched and acknowledged at STOPPING) and
   * only the bookkeeping write into the operation ledger is stuck behind
   * retryable ledger pressure. During cold formation that pressure is the
   * operation's OWN doing — a ledger self-move degrades the very partition
   * its progress writes need, so a hard persist-then-act gate stalls each
   * transition for full sql-routed retry cycles while the self-move
   * interlock freezes all other admission cluster-wide. Advancing the
   * owner-local row and re-arming the durable write (the established
   * lever-(a) supersession contract) keeps the workflow moving at executor
   * speed; the durable row converges at the terminal, whose write
   * intentionally carries no expected-step CAS.
   *
   * STOPPING mirrors its producing branch (dispatch-response reconcile:
   * REMOVE, or REPLACE in its remove phase). Terminal steps are
   * deliberately NOT covered: REMOVED flows exclusively through
   * completeOperation, which owns its own durable convergence
   * (executor-outcome retry + terminal-transition repair) — a deferred-local
   * terminal here would clear the transition retry without re-driving the
   * durable persist.
   *
   * @param {Object|null} operation
   * @param {string} step
   * @return {boolean}
   * @private
   */
  isPriorityOutcomeDeferredLocalProgressStep(operation, step) {
    const partitionId = String(operation?.partitionId || '').trim();
    if (
      partitionId.length === 0 ||
      !classifySystemPartition({partitionId}).priorityControlPlane
    ) {
      return false;
    }
    return isPriorityOutcomeDeferredLocalProgressCovered(
      operation?.type,
      step,
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
    const configuredBudgetMs =
      this.resolvePriorityDispatchTransitionMutationBudgetMs(operation);
    const normalizedCreatedAtMs = Number(operation?.createdAt);
    const normalizedStartedAtMs = Number(startedAtMs);
    // The operation-level lane must anchor at operation creation, or the
    // budget re-arms on every claim and the budget-derived cutoff never
    // fires; only the SQL-write per-attempt repair lane anchors at the
    // attempt.
    const anchorMs =
      configuredBudgetMs !== REPLICA_OPERATION_DISPATCH_TIMEOUT_MS &&
      Number.isFinite(normalizedCreatedAtMs) ?
        normalizedCreatedAtMs :
        normalizedStartedAtMs;
    return createTopLevelOperationBudget({
      configuredBudgetMs,
      startedAtMs: Number.isFinite(anchorMs) ? anchorMs : Date.now(),
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
