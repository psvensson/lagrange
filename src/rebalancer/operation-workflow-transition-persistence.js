import {OPERATION_RECONCILE_OUTCOME} from './operation-workflow-reconcile-outcome.js';
import {REPLICA_OPERATION_SUPERSEDED_STATUS} from './replica-operation-progress.js';
import {releaseCompletedLearnerRetirementCleanup} from
  './operation-workflow-placement-learner-retirement.js';
import {releaseOperationLedgerSelfMoveHoldAfterTerminal} from './operation-workflow-dispatch-ledger-self-move-gate.js';
import {assertOperationUpdateRecord, assertOperationUpdateSubject} from './replica-operation-update-outcome.js';
import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  REPLACE_COMPLETION_VERDICT,
  buildReplaceCompletionRefusal,
  buildReplaceFailureRefusal,
  clearReplaceOwnerState,
  decideReplaceCompletion,
  isPartitionReplace,
} from './operation-workflow-replace-owner.js';
import {
  admitCreateTerminalFailure,
  decideFailedCreateTargetCleanup,
  revalidateCreateTerminalFailure,
} from './operation-workflow-replace-terminal-admission.js';
import {
  OperationWorkflowTransitionOrchestration,
} from './operation-workflow-transition-orchestration.js';
import {
  shouldReleaseReservationForTerminalOutcome,
} from './operation-workflow-terminal-reservation-release.js';
import {
  TERMINAL_TRANSITION_REPAIR_CAUSE,
  armFailedCreateCleanupRelease,
  armTerminalTransitionRepair,
  recoverReplicaCleanupReleaseDebt,
  clearTerminalTransitionRepair,
} from './operation-workflow-terminal-transition-repair.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';
import {operationCarriesReplicaCreateAdmission} from
  './replica-operation-create-admission-fields.js';

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
const NO_CONCURRENT_CREATE_ADMISSION_WINNER = false;
const CREATE_TARGET_LIFECYCLE_UNAVAILABLE = 'create_target_lifecycle_unavailable';
const CREATE_FAILURE_LIFECYCLE_UNAVAILABLE = Object.freeze({
  ...buildOperationTransitionOutcome({
    persisted: false,
    disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
    operation: null,
  }),
  refusal: CREATE_TARGET_LIFECYCLE_UNAVAILABLE,
});

// A failure no post-intent boundary applies to: written as it is.
const UNBOUNDED_FAILURE_ADMISSION = Object.freeze({
  refused: false,
  persistOptions: Object.freeze({}),
});

// A caller's step metadata recorded on the FAILED step entry.
function applyFailureStepMetadata(failedStepEntry, options) {
  if (
    options.stepMetadata &&
    typeof options.stepMetadata === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
  ) {
    Object.assign(failedStepEntry, options.stepMetadata);
  }
}

async function observeConcurrentCreateAdmissionWinner(
  owner,
  operation,
  transitionOutcome,
  options,
) {
  if (
    options.deferWhenCreateAdmissionWins !== true ||
    transitionOutcome?.disposition !==
      REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED
  ) {
    return NO_CONCURRENT_CREATE_ADMISSION_WINNER;
  }
  const authoritativeOperation =
    await owner.repository
      .queryReplicaOperationPersistenceAuthorityOperation(operation);
  if (
    !authoritativeOperation ||
    owner.repository.isOperationTerminal(authoritativeOperation) ||
    !operationCarriesReplicaCreateAdmission(authoritativeOperation)
  ) {
    return NO_CONCURRENT_CREATE_ADMISSION_WINNER;
  }
  assertOperationUpdateRecord(authoritativeOperation);
  assertOperationUpdateSubject(operation, authoritativeOperation);
  return authoritativeOperation;
}

class OperationWorkflowTransitionPersistence
  extends OperationWorkflowTransitionOrchestration {
  recoverReplicaCleanupReleaseDebt(options = {}) {
    return recoverReplicaCleanupReleaseDebt(this, options);
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
        const replay = await this.resolveOperationTransitionBeforeWrite(operation, step);
        if (replay) {
          return replay.operation?.completedAt === null &&
            this.repository.isOperationLocallyOwned(replay.operation) ? operation : null;
        }
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
          const persisted = await this.repository.persistOperationUpdate(projectedOperation, {
            ...this.buildOperationTransitionPersistOptions(),
            expectedWorkflowStep: WORKFLOW_STEP.PENDING,
            timeoutBudget: mutationBudget,
          });
          transitionCommitted = buildOperationTransitionOutcome(persisted,
            {repository: this.repository, requestedOperation: projectedOperation});
        } catch (error) {
          this.operationWorkflowCoordinator.removeWorkflow(operation.operationId);
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

        if (!transitionCommitted.committed) {
          this.operationWorkflowCoordinator.removeWorkflow(operation.operationId);
          if (transitionCommitted.operation?.completedAt === null &&
              transitionCommitted.operation.workflowStep === step &&
              this.repository.isOperationLocallyOwned(transitionCommitted.operation)) {
            Object.assign(operation, structuredClone(transitionCommitted.operation));
            return operation;
          }
          return null;
        }

        this.clearTransitionRetry(operation.operationId);
        this.operationWorkflowCoordinator.markTransitionCommitted(
          operation.operationId,
          step,
        );
        Object.assign(operation, structuredClone(transitionCommitted.operation));
        delete operation[PRIORITY_DEFERRED_CLAIM_EXPECTED_STEP_FIELD];

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
    this.clearOperationLedgerSelfMoveParkEvidence(operation?.operationId);
    this.clearObservedProgressRetry(operation?.operationId, {
      includeDeliveredCreateProgress: true,
    });
    this.clearPriorityActiveReplaceRetry(operation?.operationId || null);
    this.clearExecutorOutcomeRetry(operation?.operationId);
    clearReplaceOwnerState(this, operation?.operationId);
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
    persistOptions = {},
  ) {
    if (shouldReleaseReservationForTerminalOutcome(transitionOutcome)) {
      await this.releaseDurableTerminalOperation(operation, transitionOutcome);
      return;
    }
    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_PERSIST_NOT_COMMITTED,
      {operationId: operation.operationId, disposition: transitionOutcome.disposition,
        step, partitionId: operation.partitionId},
    );
    armTerminalTransitionRepair(this, projectedOperation,
      TERMINAL_TRANSITION_REPAIR_CAUSE.PERSIST_NOT_COMMITTED, persistOptions);
  }

  async releaseDurableTerminalOperation(operation, outcome) {
    if (!shouldReleaseReservationForTerminalOutcome(outcome)) {
      throw new Error('Terminal release requires a validated durable terminal outcome');
    }
    Object.assign(operation, structuredClone(outcome.operation));
    // Register exact durable debt before attempting effects. Replay and reconstruction
    // re-enter this same release phase without asking admission for another write.
    armTerminalTransitionRepair(this, outcome.operation,
      TERMINAL_TRANSITION_REPAIR_CAUSE.TERMINAL_RELEASE_PENDING);
    const releaseState = this.terminalTransitionRepairStateByOperationId.get(operation.operationId);
    if (!releaseState) throw new Error('Terminal release owner is shutting down');
    if ((outcome.committed || releaseState.pendingCommitCredit) && !releaseState.commitCounted) {
      if (operation.workflowStep === WORKFLOW_STEP.FAILED) this.stats.operationsFailed++;
      else if (operation.workflowStep !== WORKFLOW_STEP.SUPERSEDED) {
        this.stats.operationsCompleted++;
      }
      releaseState.commitCounted = true;
      releaseState.pendingCommitCredit = false;
    }
    releaseOperationLedgerSelfMoveHoldAfterTerminal(this, operation);
    await this.releaseReservationForOperation(operation);
    if (operation.workflowStep === WORKFLOW_STEP.REMOVED) {
      await releaseCompletedLearnerRetirementCleanup(this, operation);
    }
    this.clearTerminalOperationRetryState(operation);
    this.clearTransitionRetry(operation.operationId);
    this.clearDeferredSafetyBlockState(operation.operationId);
    // Terminal observations wake idempotent pruning/rebalance subscribers after
    // release, including lost replies and reconstructed owners. No permanent
    // event history is retained; only new committed results earn stats credit.
    const failed = operation.workflowStep === WORKFLOW_STEP.FAILED;
    let event = REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED;
    if (failed) event = REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED;
    if (operation.workflowStep === WORKFLOW_STEP.SUPERSEDED) {
      event = REBALANCE_COORDINATOR_EVENT.OPERATION_SUPERSEDED;
    }
    const eventPayload = failed ? {operation, errorMessage: operation.errorMessage} : {operation};
    this.emitter.emit(event, eventPayload);
    clearTerminalTransitionRepair(this, operation.operationId);
    armFailedCreateCleanupRelease(this, operation);
  }

  async persistTerminalOperation(operation, projectedOperation, reason, persistOptions) {
    try {
      const outcome = await this.executeAtomicTransition(operation,
        projectedOperation.workflowStep, reason,
        () => this.repository.persistOperationUpdate(projectedOperation, persistOptions),
        {requestedOperation: structuredClone(projectedOperation)});
      await this.resolveNotCommittedTerminalTransition(operation, projectedOperation,
        outcome, projectedOperation.workflowStep, persistOptions);
      return outcome;
    } catch (error) {
      // A failed reply can follow a durable commit. Retain the exact requested
      // effect until the repository resolves it; never promote the mirror.
      armTerminalTransitionRepair(this, projectedOperation,
        error.operationWriteCommitted === true ?
          TERMINAL_TRANSITION_REPAIR_CAUSE.CONFIRMATION_FAILED :
          TERMINAL_TRANSITION_REPAIR_CAUSE.PERSIST_NOT_COMMITTED, persistOptions);
      throw error;
    }
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
    const replay = await this.resolveOperationTransitionBeforeWrite(operation, finalStep,
      {terminalTransition: true, terminalErrorMessage: null});
    if (replay) {
      await this.releaseDurableTerminalOperation(operation, replay);
      return replay;
    }
    // R-1a (quest replace-source-removal-owner): every success edge of a
    // partition REPLACE ends here, and none completes while its source is
    // still a committed voter on the witness replica.
    if (isPartitionReplace(operation)) {
      const decision = await decideReplaceCompletion(this, operation);
      if (decision.verdict !== REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED) {
        return buildReplaceCompletionRefusal(decision);
      }
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
    const persistOptions = {
      ...this.buildOperationTransitionPersistOptions(),
      terminalTransition: true,
    };
    if (isPartitionReplace(operation)) {
      persistOptions.terminalAdmission = async () => {
        const current = await decideReplaceCompletion(this, operation);
        return current.verdict ===
          REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED;
      };
    }
    const transitionOutcome = await this.persistTerminalOperation(operation,
      projectedOperation, OPERATION_TRANSITION_REASON.OPERATION_COMPLETED, persistOptions);
    if (!transitionOutcome.committed) return transitionOutcome;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_COMPLETED, {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    armFailedCreateCleanupRelease(this, operation);

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

  async supersedePlacementRemoval(operation, {expectedWorkflowStep, reason}) {
    const finalStep = WORKFLOW_STEP.SUPERSEDED;
    const replay = await this.resolveOperationTransitionBeforeWrite(operation, finalStep,
      {terminalTransition: true, terminalErrorMessage: null});
    if (replay) {
      if (replay.reconcileOutcome !== OPERATION_RECONCILE_OUTCOME.SUPERSEDED) {
        await this.releaseDurableTerminalOperation(operation, replay);
      }
      return replay;
    }
    if (operation.type !== OperationType.REMOVE ||
        operation.workflowStep !== expectedWorkflowStep) {
      return null;
    }
    const now = Date.now();
    const transitionReason = OPERATION_TRANSITION_REASON.OPERATION_SUPERSEDED;
    const evidence = this.buildOperationTransitionStepEntry(
      operation, finalStep, transitionReason, expectedWorkflowStep, now);
    const projectedOperation = {
      ...operation,
      workflowStep: finalStep,
      status: REPLICA_OPERATION_SUPERSEDED_STATUS,
      updatedAt: now,
      completedAt: now,
      errorMessage: null,
      stepsHistory: [...operation.stepsHistory, {...evidence, supersessionReason: reason}],
    };
    return this.persistTerminalOperation(operation, projectedOperation, transitionReason, {
      ...this.buildOperationTransitionPersistOptions(),
      expectedWorkflowStep,
      terminalTransition: true,
    });
  }

  /**
   * The one post-intent no-fail guard of a create (D2; M2): after a
   * partition REPLACE's DURABLE removal intent only target death with the
   * source still a voter may end it FAILED; after a partition ADD's target
   * went live (its authoritative row ACTIVE) nothing may - it is completed
   * instead. Every elapsed-time or heuristic failure past the intent is
   * refused (typed) by failOperation, and logged here. An admitted REPLACE
   * failure carries the durable step it was admitted against, for the
   * terminal write's CAS.
   * @param {Object} operation
   * @param {string} errorMessage
   * @param {Object} options
   * @return {Promise<Object>} Frozen {refused, persistOptions,
   *   completeInstead}.
   */
  async admitOperationFailure(operation, errorMessage, options) {
    const admission = await admitCreateTerminalFailure(
      this, operation, options);
    if (admission.admitted) {
      const terminalAdmission = admission.requiresRevalidation === true ?
        () => revalidateCreateTerminalFailure(
          this,
          operation,
          admission,
          options,
        ) : undefined;
      return admission.expectedWorkflowStep === null ?
        Object.freeze({
          ...UNBOUNDED_FAILURE_ADMISSION,
          persistOptions: {terminalAdmission},
          stepMetadata: admission.stepMetadata,
        }) :
        Object.freeze({refused: false, persistOptions: {
          expectedWorkflowStep: admission.expectedWorkflowStep,
          terminalAdmission},
        stepMetadata: admission.stepMetadata});
    }
    if (admission.unavailable) {
      this.logger.warn('Create failure deferred while target lifecycle is unavailable', {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId,
      });
      return Object.freeze({refused: true, unavailable: true});
    }
    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILURE_REFUSED_AFTER_INTENT,
      {
        operationId: operation.operationId,
        type: operation.type,
        partitionId: operation.partitionId,
        workflowStep: admission.expectedWorkflowStep ??
          operation.workflowStep,
        errorMessage: this.normalizeErrorMessage(errorMessage, null),
      },
    );
    return Object.freeze({refused: true, persistOptions: {},
      completeInstead: admission.completeInstead, stepMetadata: null});
  }

  async decideFailedCreateTargetCleanup(operation) {
    return decideFailedCreateTargetCleanup(this, operation);
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
    const normalizedError = this.normalizeErrorMessage(errorMessage, 'Unknown error');
    const replay = await this.resolveOperationTransitionBeforeWrite(operation,
      WORKFLOW_STEP.FAILED, {terminalTransition: true, terminalErrorMessage: normalizedError,
        stepMetadata: options.stepMetadata});
    if (replay) {
      await this.releaseDurableTerminalOperation(operation, replay);
      return replay;
    }
    const failureAdmission =
      await this.admitOperationFailure(operation, errorMessage, options);
    if (failureAdmission.refused) {
      if (failureAdmission.unavailable) return CREATE_FAILURE_LIFECYCLE_UNAVAILABLE;
      return failureAdmission.completeInstead ?
        this.completeOperation(operation) : buildReplaceFailureRefusal();
    }
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
    applyFailureStepMetadata(failedStepEntry, {
      ...options,
      stepMetadata: {
        ...(options.stepMetadata || {}),
        ...(failureAdmission.stepMetadata || {}),
      },
    });
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
    const terminalPersistOptions = {
      ...failureAdmission.persistOptions,
      ...(options.requireCreateAdmissionAbsent === true ?
        {requireCreateAdmissionAbsent: true} :
        {}),
    };
    const transitionOutcome = await this.persistTerminalOperation(operation,
      projectedOperation, transitionReason, {
        ...this.buildOperationTransitionPersistOptions(),
        ...terminalPersistOptions,
        terminalTransition: true,
      });
    if (!transitionOutcome.committed) {
      const createAdmissionWinner = await observeConcurrentCreateAdmissionWinner(
        this, operation, transitionOutcome, options);
      if (createAdmissionWinner) {
        return Object.freeze({...transitionOutcome, createAdmissionWon: true,
          createAdmissionOperation: createAdmissionWinner});
      }
      return transitionOutcome;
    }

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
