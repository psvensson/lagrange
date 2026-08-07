import {REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS} from './replica-operation-step-policy.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowTransitionPersistence} from './operation-workflow-transition-persistence.js';
import * as DISPATCH_WAKE_PREEMPTION
  from './operation-workflow-dispatch-wake-preemption.js';
import * as DISPATCH_RESPONSE_RECONCILE
  from './operation-workflow-dispatch-response-reconcile.js';
import {
  ensureDispatchReservationOrSkip,
} from './operation-workflow-dispatch-reservation-gate.js';
import {
  OPERATION_OWNER_TURN_POLICY,
} from './operation-owner-turn-policy.js';

const {
  OPERATION_OWNER_ACTION,
  OPERATION_TRANSITION_REASON,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_LOG_MSG,
  REMOVE_SAFETY_HANDOFF_FAILURE_POLICY,
  ReplicaOperationResponseStatus,
  WORKFLOW_STEP,
  isCoordinatorOwnedOperationType,
} = OPERATION_WORKFLOW_OWNER_SHARED;

class OperationWorkflowDispatchExecution extends OperationWorkflowTransitionPersistence {
  shouldFailRemoveSafetyHandoffResponse(removeSafetyEvaluation, response) {
    return (
      removeSafetyEvaluation?.handoffFailurePolicy ===
        REMOVE_SAFETY_HANDOFF_FAILURE_POLICY.FAIL_ON_NOT_FOUND &&
      response?.status === ReplicaOperationResponseStatus.NOT_FOUND
    );
  }

  resolveRemoveSafetyHandoffFailureError(removeSafetyEvaluation) {
    if (
      typeof removeSafetyEvaluation?.handoffFailureError ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      removeSafetyEvaluation.handoffFailureError.length > 0
    ) {
      return removeSafetyEvaluation.handoffFailureError;
    }
    return removeSafetyEvaluation?.error ||
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY;
  }

  async claimPendingDispatchOperation(operation, options = {}) {
    if (
      !operation ||
      operation.workflowStep !== WORKFLOW_STEP.PENDING ||
      !isCoordinatorOwnedOperationType(operation.type) ||
      !this.repository.isOperationLocallyOwned(operation)
    ) {
      return null;
    }

    if (this.shouldUsePriorityDispatchClaimNarrowPath(operation)) {
      const claimedOperation =
        await this.claimPriorityDispatchTransition(operation, options);
      if (claimedOperation) {
        return claimedOperation;
      }
      if (!this.isOperationDeferredRetryActive(operation.operationId)) {
        const retryableClaimError =
          this.buildPriorityDispatchClaimRetryableError(operation);
        this.deferDispatchRetry(operation, retryableClaimError);
      }
      return null;
    }

    await this.updateStep(
      operation,
      WORKFLOW_STEP.SENDING,
      OPERATION_TRANSITION_REASON.DISPATCH_SENDING,
    );

    return operation;
  }

  /**
   * Claim a PENDING operation for dispatch.
   * @param {string} operationId
   * @return {Promise<Object|null>}
   */
  async claimDispatchTransition(operationId) {
    if (this.isShuttingDown || !this.isInitialized) {
      return null;
    }

    const operation = await this.repository.queryOperationById(operationId);
    if (!operation) {
      return null;
    }

    if (operation.workflowStep !== WORKFLOW_STEP.PENDING) {
      return null;
    }
    if (!isCoordinatorOwnedOperationType(operation.type)) {
      return null;
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      return null;
    }

    return this.claimPendingDispatchOperation(operation);
  }

  /**
   * Dispatch one operation through the single-flight lane.
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   */
  async dispatchOperation(operationInput, options = {}) {
    if (this.isShuttingDown || !this.isInitialized) {
      return this.buildSkippedOperationResult(
        OPERATION_WORKFLOW_OWNER_REASON.SHUTDOWN_IN_PROGRESS,
        this.getOperationIdFromInput(operationInput),
      );
    }

    const operationId = this.getOperationIdFromInput(operationInput);
    if (!operationId) {
      return this.buildSkippedOperationResult(
        OPERATION_WORKFLOW_OWNER_REASON.OPERATION_ID_REQUIRED,
        null,
      );
    }
    return this.runOperationOwnerAction(
      OPERATION_OWNER_ACTION.DISPATCH,
      operationInput,
      {
        ...options,
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH,
      },
    );
  }

  /**
   * Resolve an operation id from one supported caller payload.
   * @param {string|Object} operationInput
   * @return {string|null}
   */
  getOperationIdFromInput(operationInput) {
    if (
      typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationInput.length > 0
    ) {
      return operationInput;
    }
    if (
      !operationInput ||
      typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      return null;
    }
    if (
      typeof operationInput.operationId ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationInput.operationId.length > 0
    ) {
      return operationInput.operationId;
    }
    if (
      typeof operationInput.operation_id ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationInput.operation_id.length > 0
    ) {
      return operationInput.operation_id;
    }
    return null;
  }

  /**
   * Object dispatch input can be the only owner-local snapshot available when
   * authoritative operation visibility is deferred during the retry.
   *
   * @param {string|Object} operationInput
   * @return {boolean}
   * @private
   */
  shouldPreserveDispatchInputForTransitionRetry(operationInput) {
    return (
      operationInput &&
      typeof operationInput === 'object' &&
      (
        typeof operationInput.operationId === 'string' ||
        typeof operationInput.operation_id === 'string'
      )
    );
  }

  /**
   * Normalize one dispatch input to a canonical operation object.
   * @param {string|Object} operationInput
   * @return {Promise<Object|null>}
   */
  async resolveDispatchOperation(operationInput) {
    if (
      typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationInput.length > 0
    ) {
      return this.repository.queryOperationById(operationInput);
    }
    if (
      !operationInput ||
      typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      return null;
    }
    if (
      typeof operationInput.operationId ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationInput.operationId.length > 0
    ) {
      if (!isCoordinatorOwnedOperationType(operationInput.type)) {
        return null;
      }
      const operation = operationInput;
      const sourceReplicaId =
        this.repository.getReplaceSourceReplicaId(operation);
      if (
        typeof sourceReplicaId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        sourceReplicaId.length > 0
      ) {
        operation.sourceReplicaId = sourceReplicaId;
      }
      return operation;
    }
    if (
      typeof operationInput.operation_id ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationInput.operation_id.length > 0
    ) {
      const operation = this.repository.rowToOperation(operationInput);
      return isCoordinatorOwnedOperationType(operation?.type) ?
        operation :
        null;
    }
    return null;
  }

  /**
   * Claim one PENDING dispatch candidate into the SENDING lane.
   * @param {string|Object} operationInput
   * @param {Object} operation
   * @return {Promise<Object>} Claimed operation or a typed skip result.
   * @private
   */
  async claimPendingDispatchCandidate(operationInput, operation) {
    const claimedOperation =
      await this.claimPendingDispatchOperation(operation, {
        preserveTransitionRetrySnapshot:
          this.shouldPreserveDispatchInputForTransitionRetry(operationInput),
      });
    if (claimedOperation) {
      return claimedOperation;
    }
    if (this.isOperationDeferredRetryActive(operation.operationId)) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        operation.operationId,
        {
          error:
            OPERATION_WORKFLOW_OWNER_LITERAL
              .CONTROL_PLANE_PRESSURE_DEGRADED_WHILE_CLAIMING_PRIORITY +
            OPERATION_WORKFLOW_OWNER_LITERAL
              .DISPATCH_TRANSITION,
        },
      );
    }
    return this.buildSkippedOperationResult(
      OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
      operation.operationId,
    );
  }

  /**
   * Advance the dispatch candidate's step machine after the reservation
   * gate cleared it.
   * @param {string|Object} operationInput
   * @param {Object} operation
   * @param {Object} [options]
   * @return {Promise<Object>}
   * @private
   */
  async advanceDispatchCandidateStep(operationInput, operation, options = {}) {
    const createRearmDispatchPhase = this.isCreateRearmDispatchPhase(operation);
    if (
      this.shouldPreemptCreateRearmWithObservedProgress(
        operationInput,
        operation,
        createRearmDispatchPhase,
        options,
      ) &&
      await this.reconcileDispatchWakeOperationProgress(operation)
    ) {
      return this.buildSuccessfulOperationResult(operation.operationId);
    }

    // Fail-closed reservation gate (audit findings 3+11): after the
    // progress-preemption lanes (an operation already observed terminal or
    // claimed elsewhere no longer needs its reservation) and before any
    // claim/dispatch below — no storage-increasing dispatch proceeds
    // without an ACTIVE reservation.
    const reservationGateSkip = await ensureDispatchReservationOrSkip(
      this,
      operation,
    );
    if (reservationGateSkip) {
      return reservationGateSkip;
    }
    return this.advanceReservationClearedDispatch(operationInput, operation);
  }

  /**
   * Route one reservation-cleared dispatch candidate through the
   * phase/step dispatch machine.
   * @param {string|Object} operationInput
   * @param {Object} operation
   * @return {Promise<Object>}
   * @private
   */
  async advanceReservationClearedDispatch(operationInput, operation) {
    const replaceRemoveDispatchPhase =
      this.repository.isReplaceRemoveDispatchPhase(operation);
    const dispatchableWorkflowStep = operation.workflowStep;
    const createRearmDispatchPhase = this.isCreateRearmDispatchPhase(operation);
    if (replaceRemoveDispatchPhase) {
      if (
        !REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS.has(dispatchableWorkflowStep)
      ) {
        return this.buildSkippedOperationResult(
          OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
          operation.operationId,
        );
      }
      return this.executeOperationInternal(operation);
    }
    if (dispatchableWorkflowStep === WORKFLOW_STEP.PENDING) {
      const claimOutcome = await this.claimPendingDispatchCandidate(
        operationInput,
        operation,
      );
      if (claimOutcome?.skipped === true) {
        return claimOutcome;
      }
      return this.executeOperationInternal(claimOutcome);
    }
    if (
      dispatchableWorkflowStep !== WORKFLOW_STEP.SENDING &&
      !createRearmDispatchPhase
    ) {
      if (await this.reconcileDispatchWakeOperationProgress(operation)) {
        return this.buildSuccessfulOperationResult(operation.operationId);
      }
      return this.buildSkippedOperationResult(
        OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
        operation.operationId,
      );
    }
    return this.executeOperationInternal(operation);
  }

  /**
   * Execute one dispatch attempt after ownership serialization.
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   */
  async dispatchOperationInternal(operationInput, options = {}) {
    const operation = await this.resolveDispatchOperation(operationInput);
    const operationId = this.getOperationIdFromInput(operationInput);

    if (!operation) {
      return this.buildSkippedOperationResult(
        OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_FOUND,
        operationId,
      );
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE,
        operation.operationId,
      );
    }

    return this.advanceDispatchCandidateStep(operationInput, operation, options);
  }

  /**
   * @param {string|Object} operationInput
   * @return {boolean}
   * @private
   */
  isOperationRowDispatchWakeInput(operationInput) {
    return DISPATCH_WAKE_PREEMPTION.isOperationRowDispatchWakeInput(
      operationInput,
    );
  }

  /**
   * @param {Object} options
   * @return {boolean}
   * @private
   */
  isExplicitDispatchWakeProgressInput(options) {
    return DISPATCH_WAKE_PREEMPTION.isExplicitDispatchWakeProgressInput(
      options,
    );
  }

  /**
   * @param {Object} operation
   * @return {string}
   * @private
   */
  getDispatchWakeObservedTargetStatus(operation) {
    return DISPATCH_WAKE_PREEMPTION.getDispatchWakeObservedTargetStatus(
      this,
      operation,
    );
  }

  /**
   * @param {string|Object} operationInput
   * @param {Object} operation
   * @param {boolean} createRearmDispatchPhase
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildDispatchWakeProgressPreemptEvidence(
    operationInput,
    operation,
    createRearmDispatchPhase,
    options = {},
  ) {
    return DISPATCH_WAKE_PREEMPTION.buildDispatchWakeProgressPreemptEvidence(
      this,
      operationInput,
      operation,
      createRearmDispatchPhase,
      options,
    );
  }

  /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  resolveDispatchWakeProgressPreemptState(evidence) {
    return DISPATCH_WAKE_PREEMPTION.resolveDispatchWakeProgressPreemptState(
      evidence,
    );
  }

  /**
   * @param {string|Object} operationInput
   * @param {Object} operation
   * @param {boolean} createRearmDispatchPhase
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldPreemptCreateRearmWithObservedProgress(
    operationInput,
    operation,
    createRearmDispatchPhase,
    options = {},
  ) {
    return DISPATCH_WAKE_PREEMPTION
      .shouldPreemptCreateRearmWithObservedProgress(
        this,
        operationInput,
        operation,
        createRearmDispatchPhase,
        options,
      );
  }

  /**
   * Dispatch wakeups can arrive after cache evidence has already moved the
   * replica beyond the current durable step. Let the owner reconcile that
   * progress before replaying create dispatch or classifying the wakeup as
   * non-dispatchable.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileDispatchWakeOperationProgress(operation) {
    return DISPATCH_WAKE_PREEMPTION.reconcileDispatchWakeOperationProgress(
      this,
      operation,
    );
  }

  /**
   * PENDING dispatch wakes with target evidence need only persist the target
   * progress transition. A target `pending` row proves the create handler
   * accepted the request, so it advances the durable owner row to CREATING.
   * Running the full replace execution path here can turn a duplicate-create
   * guard into a source-removal safety failure.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileDispatchWakePendingTargetProgress(operation) {
    return DISPATCH_WAKE_PREEMPTION
      .reconcileDispatchWakePendingTargetProgress(this, operation);
  }

  async executeOperation(operation, options = {}) {
    if (
      options.ownerTurnPolicy !== OPERATION_OWNER_TURN_POLICY.RETAIN ||
      this.isShuttingDown ||
      !this.isInitialized
    ) {
      return DISPATCH_RESPONSE_RECONCILE.executeOperation.call(this, operation);
    }
    return this.runOperationOwnerAction(
      OPERATION_OWNER_ACTION.EXECUTE,
      operation,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTE,
        workflowStep: operation?.workflowStep || null,
        partitionId: operation?.partitionId || null,
        skipWhenOwnerLaneHeld: true,
        ownerTurnPolicy: OPERATION_OWNER_TURN_POLICY.RETAIN,
      },
    );
  }

  async executeOperationFromReconcilePath(operation) {
    return DISPATCH_RESPONSE_RECONCILE.executeOperationFromReconcilePath.call(
      this,
      operation,
    );
  }

  shouldBoundReplicaOperationDispatch(operation) {
    return DISPATCH_RESPONSE_RECONCILE.shouldBoundReplicaOperationDispatch.call(
      this,
      operation,
    );
  }

  buildReplicaOperationDispatchOptions(operation, dispatchNodeId) {
    return DISPATCH_RESPONSE_RECONCILE.buildReplicaOperationDispatchOptions
      .call(this, operation, dispatchNodeId);
  }

  buildReplicaOperationDispatchTimeoutError(operation) {
    return DISPATCH_RESPONSE_RECONCILE
      .buildReplicaOperationDispatchTimeoutError.call(this, operation);
  }

  async awaitReplicaOperationDispatchDeadline(operation, deliveryPromise) {
    return DISPATCH_RESPONSE_RECONCILE
      .awaitReplicaOperationDispatchDeadline.call(
        this,
        operation,
        deliveryPromise,
      );
  }

  async deliverReplicaOperationRequest(
    operation,
    target,
    request,
    dispatchNodeId,
  ) {
    return DISPATCH_RESPONSE_RECONCILE.deliverReplicaOperationRequest.call(
      this,
      operation,
      target,
      request,
      dispatchNodeId,
    );
  }

  async executeOperationInternal(operation) {
    return DISPATCH_RESPONSE_RECONCILE.executeOperationInternal.call(
      this,
      operation,
    );
  }

  async _handleDispatchResponse(operation, response, replaceRemovePhase) {
    return DISPATCH_RESPONSE_RECONCILE._handleDispatchResponse.call(
      this,
      operation,
      response,
      replaceRemovePhase,
    );
  }

  buildCreateSatisfiedReplaceResumeDecision(operation) {
    return DISPATCH_RESPONSE_RECONCILE
      .buildCreateSatisfiedReplaceResumeDecision.call(this, operation);
  }

  ensurePriorityActiveReplaceRetryArmed(operation) {
    return DISPATCH_RESPONSE_RECONCILE.ensurePriorityActiveReplaceRetryArmed
      .call(this, operation);
  }

  async reconcileCreateInProgressDispatchResponse(
    operation,
    response,
    replaceRemovePhase = false,
  ) {
    return DISPATCH_RESPONSE_RECONCILE
      .reconcileCreateInProgressDispatchResponse.call(
        this,
        operation,
        response,
        replaceRemovePhase,
      );
  }

  resolveCreateInProgressDispatchResponseStatus(operation, response) {
    return DISPATCH_RESPONSE_RECONCILE
      .resolveCreateInProgressDispatchResponseStatus.call(
        this,
        operation,
        response,
      );
  }

  async handleCreatePhaseSatisfiedResponse(operation, responseStatus) {
    return DISPATCH_RESPONSE_RECONCILE.handleCreatePhaseSatisfiedResponse.call(
      this,
      operation,
      responseStatus,
    );
  }
}

export {OperationWorkflowDispatchExecution};
