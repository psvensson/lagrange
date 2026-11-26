import {matchesRequestedCreateGrant, requiresPartitionCreateGrant} from './replica-operation-create-admission-fields.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {isTerminalTransitionOutcomeSettled} from './operation-workflow-terminal-reservation-release.js';
import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {OPERATION_RECONCILE_OUTCOME} from './operation-workflow-reconcile-outcome.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  OperationType,
  isDisruptiveOperationLedgerSelfMove,
  preserveOperationTargetNodeIncarnations,
} from './replica-status.js';
import {OperationWorkflowOwnerExecutionLane} from './operation-workflow-owner-execution-lane.js';
import {
  PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS,
  isPriorityOutcomeDeferredLocalProgressCovered,
  shouldClearPriorityDeferredClaim,
  shouldRetainPriorityActiveReplaceRetry,
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
   * @param {Object} [options.requestedOperation] Exact projected write.
   * @param {Function} [options.afterCommit]
   * @return {Promise<Object>} Validated owner transition outcome. Only a
   * recognized repository result can mark this disposable mirror committed.
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
    try {
      try {
        await this.operationWorkflowCoordinator.transitionStep(
          operation.operationId,
          {nextStep: step, reason},
          {},
          TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK,
        );
      } catch (error) {
        // A queued writer may have settled the disposable mirror since the
        // caller's preflight. Reconsult SQL only on this rejected transition;
        // ordinary writes retain their existing expected-step/terminal CAS.
        const replay = await this.resolveOperationTransitionBeforeWrite(operation, step,
          {requestedOperation: options.requestedOperation, exactRequest: true,
            acknowledgedRemovePreimage: options.acknowledgedRemovePreimage});
        if (replay) return replay;
        throw error;
      }
      const persistResult = await persistFn();
      const outcome = buildOperationTransitionOutcome(persistResult, {
        repository: this.repository,
        requestedOperation: options.requestedOperation,
      });
      if (outcome.committed) {
        this.operationWorkflowCoordinator.markTransitionCommitted(operation.operationId, step);
        if (options.afterCommit) await options.afterCommit();
      } else {
        this.operationWorkflowCoordinator.removeWorkflow(operation.operationId);
      }
      return outcome;
    } catch (error) {
      // SQL may already have committed. Discard only the disposable mirror;
      // the retained request and repository witness own recovery of that effect.
      this.operationWorkflowCoordinator.removeWorkflow(operation.operationId);
      throw error;
    }
  }

  async resolveOperationTransitionBeforeWrite(operation, step, options = {}) {
    const observation = await this.repository.observeOperationTransition(
      options.requestedOperation || operation, step, options);
    if (observation.deferredOutcome) {
      const error = new Error(observation.deferredOutcome.reasonCode);
      error.code = observation.deferredOutcome.reasonCode;
      error.deferredOutcome = observation.deferredOutcome;
      throw error;
    }
    if (observation.operation) {
      this.operationWorkflowCoordinator.removeWorkflow(operation.operationId);
      const pendingReplicaBinding = operation.type === OperationType.REPLACE &&
        operation.workflowStep === WORKFLOW_STEP.PENDING &&
        observation.operation.workflowStep === WORKFLOW_STEP.PENDING &&
        observation.operation.completedAt === null ? operation.replicaId : null;
      Object.assign(operation, structuredClone(observation.operation));
      if (pendingReplicaBinding) operation.replicaId = pendingReplicaBinding;
    }
    if (!observation.outcome) return null;
    // Reconstruct the disposable mirror only after repository proof. This
    // restores its actual history without manufacturing a transition entry.
    if (observation.operation) this.ensureOperationWorkflow(operation);
    return buildOperationTransitionOutcome(observation.outcome);
  }

  /**
   * Build the steps-history entry for one transition, stamping the target
   * readiness snapshot when available.
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
      step,
      timestamp: now,
      previousStep,
      reason: transitionReason,
      ownerKey: operation.operationId,
    };
    if (readinessSnapshot) {
      stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] = readinessSnapshot;
    }
    preserveOperationTargetNodeIncarnations(operation, stepEntry);
    return stepEntry;
  }

  /**
   * Persist one projected step transition, applying the priority dispatch
   * mutation budget when the partition qualifies and resolving the
   * expected-step CAS anchor.
   * @param {Object} operation
   * @param {Object} projectedOperation
   * @param {string} previousStep
   * @param {string} step
   * @param {number} now
   * @return {Promise<Object>}
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
  }

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
    const currentStepsHistory = Array.isArray(operation?.stepsHistory) ?
      operation.stepsHistory :
      [];
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

  // options (optional): {stepMetadata} recorded on the new step entry;
  // {requireDurable}: counts only a committed durable write - the REPLACE
  // removal-intent boundary (quest replace-source-removal-owner).
  async updateStep(operation, step, reason, options) {
    const createBasis = step === WORKFLOW_STEP.CREATING && requiresPartitionCreateGrant(operation) ?
      {createAdmissionAttemptToken: operation.createAdmissionAttemptToken,
        createAdmissionOwnerIncarnation: operation.createAdmissionOwnerIncarnation, updatedAt: operation.updatedAt} : null;
    const replay = await this.resolveOperationTransitionBeforeWrite(operation, step, options);
    if (replay) {
      if (isTerminalTransitionOutcomeSettled(replay)) {
        await this.releaseDurableTerminalOperation(operation, replay);
      }
      return replay.reconcileOutcome;
    }
    const previousStep = operation.workflowStep;
    if (createBasis && (previousStep !== WORKFLOW_STEP.SENDING ||
        !matchesRequestedCreateGrant(createBasis, operation))) {
      this.scheduleObservedProgressRetry(operation.operationId, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT);
      return OPERATION_RECONCILE_OUTCOME.WAITING;
    }
    // CREATE attempts re-enter from their committed phase. Dispatch itself
    // cannot reopen the initial SENDING edge after ADD or REPLACE progress.
    if (step === WORKFLOW_STEP.SENDING && previousStep !== WORKFLOW_STEP.PENDING &&
        operation.entityType === SERVICE_TYPE.PARTITION &&
        (operation.type === OperationType.ADD || operation.type === OperationType.REPLACE)) {
      return OPERATION_RECONCILE_OUTCOME.REFUSED;
    }
    const transitionReason =
      reason || this.resolveTransitionReason(previousStep, step);
    const now = Date.now();
    const persistedStatus = WORKFLOW_STEP_TO_STATUS[step] || operation.status;
    const {projectedOperation} =
      this.buildProjectedStepTransitionOperation(
        operation,
        step,
        transitionReason,
        previousStep,
        now,
        persistedStatus,
        options?.stepMetadata,
      );
    const persistFn = async () =>
      this.persistProjectedStepTransition(
        operation,
        projectedOperation,
        previousStep,
        step,
        now,
      );

    let transitionOutcome;
    try {
      transitionOutcome = await this.executeAtomicTransition(
        operation,
        step,
        transitionReason,
        persistFn,
        {
          requestedOperation: projectedOperation,
        },
      );
    } catch (error) {
      if (
        createBasis || !this.shouldUsePriorityDispatchDeferredLocalProgress(
          operation,
          step,
          error,
          options,
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
      return OPERATION_RECONCILE_OUTCOME.WAITING;
    }

    if (!transitionOutcome.committed) {
      if (isTerminalTransitionOutcomeSettled(transitionOutcome)) {
        await this.releaseDurableTerminalOperation(operation, transitionOutcome);
      } else if (transitionOutcome.operation) {
        Object.assign(operation, structuredClone(transitionOutcome.operation));
      }
      return transitionOutcome.reconcileOutcome;
    }

    this.commitProjectedStepTransition(
      operation,
      transitionOutcome.operation,
      step,
      transitionReason,
      previousStep,
    );

    return transitionOutcome.reconcileOutcome;
  }

  /**
   * Commit one persisted step transition onto the live operation object:
   * clear the retry lanes, project the durable fields, and emit the
   * STEP_CHANGED log/event pair.
   * @param {Object} operation
   * @param {Object} projectedOperation
   * @param {string} step
   * @param {string} transitionReason
   * @param {string} previousStep
   * @private
   */
  commitProjectedStepTransition(
    operation,
    projectedOperation,
    step,
    transitionReason,
    previousStep,
  ) {
    this.clearTransitionRetry(operation.operationId);
    if (!shouldRetainPriorityActiveReplaceRetry(step)) {
      this.clearPriorityActiveReplaceRetry(operation.operationId);
    }
    Object.assign(operation, structuredClone(projectedOperation));
    if (shouldClearPriorityDeferredClaim(step)) {
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
    // A disruptive ledger self-move's SENDING claim is the cluster-visible
    // engagement of the run-20 hold: it must commit durably before
    // CREATE_REPLICA is sent, never be skipped locally under pressure.
    return (
      this.shouldUsePriorityDispatchClaimNarrowPath(operation) &&
      !isDisruptiveOperationLedgerSelfMove(
        operation?.type,
        operation?.partitionId,
      ) &&
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
   * @param {Object} [options] - updateStep options; requireDurable refuses.
   * @return {boolean}
   * @private
   */
  shouldUsePriorityDispatchDeferredLocalProgress(
    operation, step, errorLike, options) {
    if (options?.requireDurable === true ||
        !isRetryableControlPlaneError(errorLike)) {
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
