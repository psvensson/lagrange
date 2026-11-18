import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerExecutionLane} from './operation-workflow-owner-execution-lane.js';
import {logOperationReadinessEvidence} from './operation-readiness-evidence-log.js';
import {isTerminalTypedDistributedFailure} from
  '../control-plane/control-plane-error-classification.js';
import {
  clearTerminalTransitionRepair,
} from './operation-workflow-terminal-transition-repair.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';
import {
  deferStepWrite,
  persistOwedStepBefore,
} from './operation-workflow-transition-retry.js';
import {
  PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS,
  shouldRetainPriorityActiveReplaceRetry,
} from './replica-operation-step-policy.js';

const {
  ControlPlaneReadinessService,
  DISPATCH_RETRY_DELAY_MS,
  INITIAL_PARTITION_IDS,
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
  constructor(options) {
    super(options);
    // operationId -> the step write still owed to the durable row
    // (operation-workflow-transition-retry.js, deferred step write).
    this.deferredStepWriteByOperationId = new Map();
  }

  /**
   * Capture the workflow record as its last committed row left it.
   * @param {string} operationId
   * @return {Function} Restores the record to the captured state.
   * @private
   */
  captureCommittedWorkflowRecord(operationId) {
    const workflowRecord =
      this.operationWorkflowCoordinator.getWorkflowById(operationId);
    const committedRecord = {...workflowRecord};
    return () => {
      for (const field of Object.keys(workflowRecord)) {
        if (!(field in committedRecord)) {
          delete workflowRecord[field];
        }
      }
      Object.assign(workflowRecord, committedRecord);
    };
  }

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
   * @return {Promise<Object>} Typed transition outcome {committed,
   *   disposition}: committed is true when this call committed the
   *   transition; disposition is the persist layer's typed update
   *   disposition when persistFn returned one, null otherwise (idempotent
   *   local replay or a boolean-shaped persist result). The disposition
   *   lets terminal callers tell a lost-to-other-terminal outcome apart
   *   from unresolved divergence (audit findings 3+11).
   */
  async executeAtomicTransition(
    operation,
    step,
    reason,
    persistFn,
    options = {},
  ) {
    return this.repository.runReplicaOperationTransitionExclusive(
      async () =>
        this.runAtomicTransitionUnderLane(
          operation,
          step,
          reason,
          persistFn,
          options,
        ),
      {operation},
    );
  }

  /**
   * The transition-exclusive body of executeAtomicTransition.
   * @param {Object} operation
   * @param {string} step
   * @param {string} reason
   * @param {Function} persistFn
   * @param {Object} options
   * @return {Promise<Object>} Typed transition outcome.
   * @private
   */
  async runAtomicTransitionUnderLane(
    operation,
    step,
    reason,
    persistFn,
    options,
  ) {
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
      return Object.freeze({committed: false, disposition: null});
    }

    // The workflow record shows a step only once its row committed: the
    // record validates the transition first and is restored when the write
    // fails or is refused.
    const restoreCommittedWorkflowRecord =
      this.captureCommittedWorkflowRecord(operation.operationId);
    await this.operationWorkflowCoordinator.transitionStep(
      operation.operationId,
      {nextStep: step, reason},
      {},
      TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
    );
    let persistResult;
    try {
      persistResult = await persistFn();
    } catch (error) {
      restoreCommittedWorkflowRecord();
      throw error;
    }
    if (
      persistResult === false ||
      persistResult?.persisted === false
    ) {
      restoreCommittedWorkflowRecord();
      return this.resolveRejectedTransitionPersistOutcome(
        operation,
        persistResult,
      );
    }
    this.operationWorkflowCoordinator.markTransitionCommitted(
      operation.operationId,
      step,
    );
    // A committed row owes no earlier step write.
    this.deferredStepWriteByOperationId.delete(operation.operationId);
    if (typeof options.afterCommit === 'function') {
      await options.afterCommit();
    }
    return Object.freeze({
      committed: true,
      disposition: this.extractPersistOutcomeDisposition(persistResult),
    });
  }

  /**
   * @param {Object|null|boolean} persistResult
   * @return {string|null}
   * @private
   */
  extractPersistOutcomeDisposition(persistResult) {
    return typeof persistResult?.disposition === 'string' ?
      persistResult.disposition :
      null;
  }

  /**
   * A rejected persist either lost the terminal CAS to a DIFFERENT durable
   * terminal (adopt the winner; never re-assert the losing terminal) or
   * diverged unresolved. Both arms report the typed disposition so terminal
   * callers can gate reservation release on the outcome (audit findings
   * 3+11, 6).
   * @param {Object} operation
   * @param {Object|null|boolean} persistResult
   * @return {Object} Typed transition outcome.
   * @private
   */
  resolveRejectedTransitionPersistOutcome(operation, persistResult) {
    // A lost terminal CAS surfaces the winning terminal row through the
    // typed disposition (the repository already adopted it into the
    // projected operation): mirror the winner into the live operation
    // and clear any armed repair — the loser must never re-assert its
    // own terminal state (audit finding 6).
    if (
      persistResult?.disposition ===
      REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED &&
      persistResult?.operation
    ) {
      this.adoptWinningTerminalOperationOutcome(
        operation,
        persistResult.operation,
      );
      clearTerminalTransitionRepair(this, operation.operationId);
    }
    return Object.freeze({
      committed: false,
      disposition: this.extractPersistOutcomeDisposition(persistResult),
    });
  }

  /**
   * Build the steps-history entry for one transition. The entry carries the
   * transition only; the target's readiness is an observation and is logged
   * when the step commits (logOperationStepReadinessEvidence), never stored.
   * @param {Object} operation
   * @param {string} step
   * @param {string} transitionReason
   * @param {string} previousStep
   * @param {number} now
   * @return {Object}
   * @private
   */
  buildOperationTransitionStepEntry(
    operation,
    step,
    transitionReason,
    previousStep,
    now,
  ) {
    return {
      step,
      timestamp: now,
      previousStep,
      reason: transitionReason,
      ownerKey: operation.operationId,
    };
  }

  /**
   * Log the target node's readiness at one committed step, console-only.
   * @param {Object} operation - The operation at its committed step.
   * @return {void}
   * @private
   */
  logOperationStepReadinessEvidence(operation) {
    const decisionDimension =
      this.resolveOperationReadinessDecisionDimension(operation);
    const targetNodeId = operation.targetNodeId;
    logOperationReadinessEvidence({
      operationId: operation.operationId,
      workflowStep: operation.workflowStep,
      partitionId: operation.partitionId,
      targetNodeId,
      readinessSnapshot: targetNodeId ?
        ControlPlaneReadinessService.compactSnapshotSummary(
          this.controlPlaneReadinessService.getNodeReadinessSync(
            targetNodeId,
            {decisionDimension},
          ),
          decisionDimension,
        ) :
        null,
    });
  }

  /**
   * Persist one projected step transition, applying the priority dispatch
   * mutation budget when the partition qualifies.
   * @param {Object} operation
   * @param {Object} projectedOperation
   * @param {string} previousStep
   * @param {string} step
   * @param {number} now
   * @return {Promise<Object|boolean>}
   * @private
   */
  async persistProjectedStepTransition(
    operation,
    projectedOperation,
    previousStep,
    step,
    now,
  ) {
    const persistOptions = this.buildOperationTransitionPersistOptions();
    const budgetedPersistOptions =
      this.shouldUsePriorityDispatchTransitionMutationBudget(
        operation,
        step,
      ) ?
        {
          ...persistOptions,
          timeoutBudget:
            this.buildPriorityDispatchTransitionMutationBudget(
              operation,
              now,
            ),
        } :
        persistOptions;
    // Every durable step transition compares-and-sets against the step the
    // owner read.
    return this.repository.persistOperationUpdate(
      projectedOperation,
      {...budgetedPersistOptions, expectedWorkflowStep: previousStep},
    );
  }

  /**
   * Project one idempotent (locally already-committed) step transition onto
   * the live operation object.
   * @param {Object} operation
   * @param {string} step
   * @param {string} persistedStatus
   * @param {Array} currentStepsHistory
   * @param {number} now
   * @private
   */
  projectIdempotentStepTransition(
    operation,
    step,
    persistedStatus,
    currentStepsHistory,
    now,
  ) {
    operation.workflowStep = step;
    operation.status = persistedStatus;
    const previousUpdatedAt = Number(operation.updatedAt);
    operation.updatedAt = Number.isFinite(previousUpdatedAt) ?
      Math.max(previousUpdatedAt, now) :
      now;
    operation.stepsHistory = currentStepsHistory;
  }

  /**
   * Update operation workflow step.
   * @param {Object} operation
   * @param {string} step
   * @param {string} [reason]
   * @return {Promise<void>}
   */
  /**
   * Build the projected operation row for one step transition.
   * @param {Object} operation
   * @param {string} step
   * @param {string} transitionReason
   * @param {string} previousStep
   * @param {number} now
   * @param {string} persistedStatus
   * @param {Object} [stepMetadata] - Fields recorded on the new step entry.
   * @return {Object} {projectedOperation, currentStepsHistory}
   * @private
   */
  buildProjectedStepTransitionOperation(
    operation,
    step,
    transitionReason,
    previousStep,
    now,
    persistedStatus,
    stepMetadata,
  ) {
    const stepEntry = Object.assign(this.buildOperationTransitionStepEntry(
      operation,
      step,
      transitionReason,
      previousStep,
      now,
    ), stepMetadata);
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
    return {projectedOperation, currentStepsHistory};
  }

  // An operation's step advances only by its committed row: the operation
  // object, the workflow record and the cache show `step` after this write
  // commits and never before. options (optional): {stepMetadata} recorded
  // on the new step entry.
  async updateStep(operation, step, reason, options) {
    if (operation.workflowStep === step) {
      return false;
    }
    // An earlier step whose write is still owed is persisted first, so the
    // durable history advances in order.
    await persistOwedStepBefore(this, operation, step);
    const previousStep = operation.workflowStep;
    if (previousStep === step) {
      return false;
    }
    const transitionReason =
      reason || this.resolveTransitionReason(previousStep, step);
    const now = Date.now();
    const persistedStatus = WORKFLOW_STEP_TO_STATUS[step] || operation.status;
    const {projectedOperation, currentStepsHistory} =
      this.buildProjectedStepTransitionOperation(
        operation,
        step,
        transitionReason,
        previousStep,
        now,
        persistedStatus,
        options?.stepMetadata,
      );
    // What the persist step itself threw, told apart from any other refusal
    // of the atomic transition.
    const persistAttempt = {threw: false, error: undefined};
    const persistFn = async () => {
      try {
        return await this.persistProjectedStepTransition(
          operation,
          projectedOperation,
          previousStep,
          step,
          now,
        );
      } catch (error) {
        persistAttempt.threw = true;
        persistAttempt.error = error;
        throw error;
      }
    };

    let transitionOutcome;
    try {
      transitionOutcome = await this.executeAtomicTransition(
        operation,
        step,
        transitionReason,
        persistFn,
        {
          onIdempotentTransition: () =>
            this.projectIdempotentStepTransition(
              operation,
              step,
              persistedStatus,
              currentStepsHistory,
              now,
            ),
          afterCommit: async () => {
            await this.confirmCommittedTransitionPersistence(projectedOperation);
          },
        },
      );
    } catch (error) {
      if (persistAttempt.threw && error === persistAttempt.error) {
        await this.resolveStepPersistFailure(operation, error, {
          step,
          reason: transitionReason,
          stepMetadata: options?.stepMetadata,
        });
      }
      throw error;
    }

    if (!transitionOutcome?.committed) {
      if (step !== WORKFLOW_STEP.ACTIVE) {
        this.clearPriorityActiveReplaceRetry(operation?.operationId || null);
      }
      return false;
    }

    this.commitProjectedStepTransition(
      operation,
      projectedOperation,
      step,
      persistedStatus,
      transitionReason,
      previousStep,
      now,
    );

    return true;
  }

  /**
   * Commit one persisted step transition onto the live operation object:
   * clear the retry lanes, project the durable fields, and emit the
   * STEP_CHANGED log/event pair.
   * @param {Object} operation
   * @param {Object} projectedOperation
   * @param {string} step
   * @param {string} persistedStatus
   * @param {string} transitionReason
   * @param {string} previousStep
   * @param {number} now
   * @private
   */
  commitProjectedStepTransition(
    operation,
    projectedOperation,
    step,
    persistedStatus,
    transitionReason,
    previousStep,
    now,
  ) {
    this.clearTransitionRetry(operation.operationId);
    if (!shouldRetainPriorityActiveReplaceRetry(step)) {
      this.clearPriorityActiveReplaceRetry(operation.operationId);
    }
    operation.workflowStep = step;
    operation.updatedAt = now;
    operation.status = persistedStatus;
    operation.stepsHistory = projectedOperation.stepsHistory;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.STEP_CHANGED, {
      operationId: operation.operationId,
      previousStep,
      newStep: step,
      reason: transitionReason,
      status: operation.status,
      partitionId: operation.partitionId,
    });
    this.logOperationStepReadinessEvidence(operation);

    this.emitter.emit(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, {
      operation,
      previousStep,
      newStep: step,
      reason: transitionReason,
    });
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
   * A step write failed; nothing advanced. A retryable failure defers the
   * TRANSITION (the write stays owed and its retry never repeats the
   * effect); a failure typed permanent by the control-plane classifier
   * fails the operation with its cause; an unclassified failure is left to
   * the caller. The caller's error propagates in every case.
   * @param {Object} operation
   * @param {Error|Object} error
   * @param {Object} write - {step, reason, stepMetadata}.
   * @return {Promise<void>}
   * @private
   */
  async resolveStepPersistFailure(operation, error, write) {
    if (isRetryableControlPlaneError(error)) {
      deferStepWrite(this, operation, write, error);
      return;
    }
    if (isTerminalTypedDistributedFailure(error)) {
      await this.failOperation(operation, error);
    }
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
