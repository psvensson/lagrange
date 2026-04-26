import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerSegment3} from './operation-workflow-owner-segment-3.js';

const {
  DISPATCH_RETRY_DELAY_MS,
  FAILURE_LOG_LEVEL,
  NUM,
  OPERATION_HANDLER,
  OPERATION_OWNER_ACTION,
  OPERATION_TRANSITION_REASON,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  OperationType,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_LOG_MSG,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
  WORKFLOW_STEP,
  classifyTransportDeliveryOutcome,
  isCoordinatorOwnedOperationType,
  isDeliveredTransportDeliveryOutcome,
  isPriorityControlPlanePartition,
} = OPERATION_WORKFLOW_OWNER_SHARED;

class OperationWorkflowOwnerSegment4 extends OperationWorkflowOwnerSegment3 {
  async claimPendingDispatchOperation(operation) {
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
        await this.claimPriorityDispatchTransition(operation);
      if (claimedOperation) {
        return claimedOperation;
      }
      const retryableClaimError =
        this.buildPriorityDispatchClaimRetryableError(operation);
      this.deferDispatchRetry(operation, retryableClaimError);
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
  async dispatchOperation(operationInput) {
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
      operationInput.length > NUM.ZERO
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
      operationInput.operationId.length > NUM.ZERO
    ) {
      return operationInput.operationId;
    }
    if (
      typeof operationInput.operation_id ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationInput.operation_id.length > NUM.ZERO
    ) {
      return operationInput.operation_id;
    }
    return null;
  }

  /**
   * Normalize one dispatch input to a canonical operation object.
   * @param {string|Object} operationInput
   * @return {Promise<Object|null>}
   */
  async resolveDispatchOperation(operationInput) {
    if (
      typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationInput.length > NUM.ZERO
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
      operationInput.operationId.length > NUM.ZERO
    ) {
      if (!isCoordinatorOwnedOperationType(operationInput.type)) {
        return null;
      }
      const operation = operationInput;
      const sourceReplicaId =
        this.repository.getReplaceSourceReplicaId(operation);
      if (
        typeof sourceReplicaId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        sourceReplicaId.length > NUM.ZERO
      ) {
        operation.sourceReplicaId = sourceReplicaId;
      }
      return operation;
    }
    if (
      typeof operationInput.operation_id ===
        OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationInput.operation_id.length > NUM.ZERO
    ) {
      const operation = this.repository.rowToOperation(operationInput);
      return isCoordinatorOwnedOperationType(operation?.type) ?
        operation :
        null;
    }
    return null;
  }

  /**
   * Execute one dispatch attempt after ownership serialization.
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   */
  async dispatchOperationInternal(operationInput) {
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

    let dispatchOperation = operation;
    const replaceRemoveDispatchPhase =
      this.repository.isReplaceRemoveDispatchPhase(operation);
    const dispatchableWorkflowStep = operation.workflowStep;
    const createRearmDispatchPhase = this.isCreateRearmDispatchPhase(operation);
    if (replaceRemoveDispatchPhase) {
      if (
        dispatchableWorkflowStep !== WORKFLOW_STEP.ACTIVE &&
        dispatchableWorkflowStep !== WORKFLOW_STEP.STOPPING
      ) {
        return this.buildSkippedOperationResult(
          OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
          operation.operationId,
        );
      }
    } else if (dispatchableWorkflowStep === WORKFLOW_STEP.PENDING) {
      const claimedOperation =
        await this.claimPendingDispatchOperation(operation);
      if (!claimedOperation) {
        const dispatchRetryScheduled = this.dispatchRetryTimerByOperationId.has(
          operation.operationId,
        );
        if (dispatchRetryScheduled) {
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
      dispatchOperation = claimedOperation;
    } else if (
      dispatchableWorkflowStep !== WORKFLOW_STEP.SENDING &&
      !createRearmDispatchPhase
    ) {
      return {
        success: false,
        skipped: true,
        reason: OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
        operationId: operation.operationId,
      };
    }

    return this.executeOperationInternal(dispatchOperation);
  }

  /**
   * Execute operation through the single-flight lane.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async executeOperation(operation) {
    if (this.isShuttingDown || !this.isInitialized) {
      return {
        success: false,
        skipped: true,
        reason: OPERATION_WORKFLOW_OWNER_REASON.SHUTDOWN_IN_PROGRESS,
        operationId: operation?.operationId,
      };
    }

    return this.runOperationOwnerAction(
      OPERATION_OWNER_ACTION.EXECUTE,
      operation,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTE,
        workflowStep: operation?.workflowStep || null,
        partitionId: operation?.partitionId || null,
        skipWhenOwnerLaneHeld: true,
      },
    );
  }

  /**
   * Execute one operation from reconciliation paths that may already hold
   * the per-operation owner key.
   *
   * Calling executeOperation() while runExclusive already owns the same key
   * returns OPERATION_ALREADY_EXECUTING and can stall REPLACE source-removal
   * progression. Reconciliation paths must dispatch directly when they
   * already hold ownership.
   *
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async executeOperationFromReconcilePath(operation) {
    return this.runOperationOwnerAction(
      OPERATION_OWNER_ACTION.EXECUTE,
      operation,
      {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTE_RECONCILE,
        workflowStep: operation?.workflowStep || null,
        partitionId: operation?.partitionId || null,
        runInlineWhenOwnerLaneHeld: true,
      },
    );
  }

  /**
   * Execute operation body once per operation ID.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async executeOperationInternal(operation) {
    if (!this.messageRouter) {
      throw new Error(REBALANCE_COORDINATOR_ERROR_MSG.ROUTER_MISSING);
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE,
        operation?.operationId,
      );
    }

    const replaceRemoveDispatchPhase =
      this.repository.isReplaceRemoveDispatchPhase(operation);
    const removeStoppingReplayPhase =
      operation.type === OperationType.REMOVE &&
      operation.workflowStep === WORKFLOW_STEP.STOPPING;
    const createRearmDispatchPhase = this.isCreateRearmDispatchPhase(operation);
    const replaceSourceReplicaId =
      this.repository.getReplaceSourceReplicaId(operation);

    const supersededPriorityRecoveryError =
      this.isPriorityRecoverySupersededTargetFailureApplicable(
        operation,
        replaceRemoveDispatchPhase,
      ) ?
        await this.getPriorityRecoverySupersededTargetError(operation) :
        null;
    if (supersededPriorityRecoveryError) {
      await this.failOperation(operation, supersededPriorityRecoveryError, {
        logLevel: FAILURE_LOG_LEVEL.WARN,
      });
      return this.buildFailedOperationResult(
        operation.operationId,
        supersededPriorityRecoveryError,
      );
    }

    if (
      !replaceRemoveDispatchPhase &&
      !removeStoppingReplayPhase &&
      !createRearmDispatchPhase
    ) {
      await this.updateStep(operation, WORKFLOW_STEP.SENDING);
    }

    const removeSafetyEvaluation = await this.evaluateRemoveSafety(operation);
    if (removeSafetyEvaluation?.error) {
      if (
        removeSafetyEvaluation.classification ===
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER
      ) {
        if (removeSafetyEvaluation.handoffRequest) {
          await this.dispatchRemoveSafetyHandoffRequest(
            operation,
            removeSafetyEvaluation.handoffRequest,
          );
        }
        this.logDeferredSafetyBlockedRemove(
          operation,
          removeSafetyEvaluation.error,
          removeSafetyEvaluation.deferReason,
        );
        this.scheduleDeferredSafetyRetry(
          operation,
          removeSafetyEvaluation.deferReason,
          removeSafetyEvaluation.error,
        );
        return this.buildSkippedOperationResult(
          REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
          operation.operationId,
          {
            deferReason: removeSafetyEvaluation.deferReason,
            error: removeSafetyEvaluation.error,
          },
        );
      }
      await this.failOperation(operation, removeSafetyEvaluation.error, {
        logLevel: FAILURE_LOG_LEVEL.WARN,
        logMessage:
          REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY,
      });
      return this.buildFailedOperationResult(
        operation.operationId,
        removeSafetyEvaluation.error,
      );
    }
    this.clearDeferredSafetyBlockState(operation.operationId);

    const entityType = operation.entityType || SERVICE_TYPE.PARTITION;
    const entityId = operation.entityId || operation.partitionId;
    const handlerType =
      OPERATION_HANDLER[entityType] ||
      OPERATION_HANDLER[SERVICE_TYPE.PARTITION];
    let dispatchNodeId = operation.targetNodeId;
    let messageType = ReplicaOperationMessageType.CREATE_REPLICA;
    let requestReplicaId = operation.replicaId;
    let requestReason = null;

    if (operation.type === OperationType.REMOVE) {
      messageType = ReplicaOperationMessageType.REMOVE_REPLICA;
    } else if (operation.type === OperationType.REPLACE) {
      if (replaceRemoveDispatchPhase) {
        dispatchNodeId = operation.sourceNodeId;
        messageType = ReplicaOperationMessageType.REMOVE_REPLICA;
        requestReplicaId = replaceSourceReplicaId;
        requestReason = OPERATION_WORKFLOW_OWNER_LITERAL.REPLACE_SOURCE_REMOVAL;
      } else {
        messageType = ReplicaOperationMessageType.CREATE_REPLICA;
        if (
          !operation.replicaId ||
          operation.replicaId === replaceSourceReplicaId
        ) {
          operation.replicaId = await this.allocateCanonicalReplicaId({
            partitionId: operation.partitionId,
            entityType,
            entityId,
            excludeReplicaIds: replaceSourceReplicaId ?
              [replaceSourceReplicaId] :
              [],
          });
        }
        requestReplicaId = operation.replicaId;
      }
    }

    if (
      operation.type === OperationType.REPLACE &&
      replaceRemoveDispatchPhase &&
      !requestReplicaId
    ) {
      const replaceSourceMissing =
        'Missing source replica for REPLACE operation ' + operation.operationId;
      await this.failOperation(operation, replaceSourceMissing);
      return this.buildFailedOperationResult(
        operation.operationId,
        replaceSourceMissing,
      );
    }

    const target = `${dispatchNodeId}/service/${handlerType}`;
    const request = {
      [ReplicaOperationField.TYPE]: messageType,
      [ReplicaOperationField.OPERATION_ID]: operation.operationId,
      [ReplicaOperationField.OPERATION_TYPE]: operation.type,
      [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
      [ReplicaOperationField.REPLICA_ID]: requestReplicaId,
      [ReplicaOperationField.SOURCE_NODE_ID]: operation.sourceNodeId,
      [ReplicaOperationField.ENTITY_TYPE]: entityType,
      [ReplicaOperationField.ENTITY_ID]: entityId,
    };
    if (requestReason) {
      request[ReplicaOperationField.REASON] = requestReason;
    }
    if (
      Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]) &&
      operation[ReplicaOperationField.REPLICA_IDS].length > NUM.ZERO
    ) {
      request[ReplicaOperationField.REPLICA_IDS] =
        operation[ReplicaOperationField.REPLICA_IDS];
    }
    if (
      Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]) &&
      operation[ReplicaOperationField.PEER_ADDRESSES].length > NUM.ZERO
    ) {
      request[ReplicaOperationField.PEER_ADDRESSES] =
        operation[ReplicaOperationField.PEER_ADDRESSES];
    }
    if (
      operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] &&
      typeof operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] ===
        OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] =
        operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA];
    }
    if (
      operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] &&
      typeof operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] ===
        OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] =
        operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA];
    }

    this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.SEND_OPERATION, {
      operationId: operation.operationId,
      target,
      type: messageType,
      entityType,
      entityId,
      replaceRemovePhase: replaceRemoveDispatchPhase,
    });

    let response;
    try {
      response = classifyTransportDeliveryOutcome(
        await this.messageRouter.deliver(target, request, {
          targetNodeId: dispatchNodeId,
          // Replica operation dispatch is the control-plane progress signal that
          // advances split/rebalance workflows. It must preempt bulk metadata
          // replication from transaction bookkeeping.
          deliveryPriority: 'critical',
        }),
      );
    } catch (error) {
      const errorMsg = this.normalizeErrorMessage(
        error,
        REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
      );
      if (this.deferDispatchRetry(operation, error)) {
        return this.buildSkippedOperationResult(
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          operation.operationId,
          {
            error: errorMsg,
          },
        );
      }
      await this.failOperation(operation, errorMsg);
      return this.buildFailedOperationResult(operation.operationId, errorMsg);
    }

    if (
      response?.success === false &&
      response?.reason === REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING
    ) {
      return response;
    }

    if (!isDeliveredTransportDeliveryOutcome(response)) {
      const errorLike = response.error || response;
      const errorMsg = this.normalizeErrorMessage(
        errorLike,
        REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
      );
      if (this.deferDispatchRetry(operation, errorLike)) {
        return this.buildSkippedOperationResult(
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          operation.operationId,
          {
            error: errorMsg,
          },
        );
      }
      await this.failOperation(operation, errorMsg);
      return this.buildFailedOperationResult(operation.operationId, errorMsg);
    }

    return this._handleDispatchResponse(
      operation,
      response,
      replaceRemoveDispatchPhase,
    );
  }

  /**
   * Process executor dispatch response and advance workflow.
   * @param {Object} operation
   * @param {Object} response
   * @param {boolean} replaceRemovePhase
   * @return {Promise<Object>}
   * @private
   */
  async _handleDispatchResponse(operation, response, replaceRemovePhase) {
    this.clearDispatchRetry(operation?.operationId);
    if (
      response.status === ReplicaOperationResponseStatus.INITIATED ||
      response.status === ReplicaOperationResponseStatus.IN_PROGRESS
    ) {
      let nextStep = WORKFLOW_STEP.CREATING;
      if (
        operation.type === OperationType.REMOVE ||
        (operation.type === OperationType.REPLACE && replaceRemovePhase)
      ) {
        nextStep = WORKFLOW_STEP.STOPPING;
      }
      await this.updateStep(operation, nextStep);
      return this.buildSuccessfulOperationResult(operation.operationId, {
        status: OPERATION_WORKFLOW_OWNER_LITERAL.IN_PROGRESS,
      });
    }

    if (response.status === ReplicaOperationResponseStatus.ALREADY_EXISTS) {
      if (
        operation.type === OperationType.ADD ||
        (operation.type === OperationType.REPLACE && !replaceRemovePhase)
      ) {
        return this.handleCreatePhaseSatisfiedResponse(
          operation,
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
        );
      }
      if (
        operation.type === OperationType.REMOVE ||
        (operation.type === OperationType.REPLACE && replaceRemovePhase)
      ) {
        return this.handleStopPhaseSatisfiedResponse(
          operation,
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
        );
      }
      await this.completeOperation(operation);
      return this.buildSuccessfulOperationResult(operation.operationId, {
        status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
      });
    }

    if (response.status === ReplicaOperationResponseStatus.COMPLETED) {
      if (
        operation.type === OperationType.ADD ||
        (operation.type === OperationType.REPLACE && !replaceRemovePhase)
      ) {
        return this.handleCreatePhaseSatisfiedResponse(
          operation,
          ReplicaOperationResponseStatus.COMPLETED,
        );
      }
      if (
        operation.type === OperationType.REMOVE ||
        (operation.type === OperationType.REPLACE && replaceRemovePhase)
      ) {
        return this.handleStopPhaseSatisfiedResponse(
          operation,
          ReplicaOperationResponseStatus.COMPLETED,
        );
      }
      await this.completeOperation(operation);
      return this.buildSuccessfulOperationResult(operation.operationId, {
        status: ReplicaOperationResponseStatus.COMPLETED,
      });
    }

    if (
      response.status === ReplicaOperationResponseStatus.NOT_FOUND &&
      (operation.type === OperationType.REMOVE ||
        (operation.type === OperationType.REPLACE && replaceRemovePhase))
    ) {
      return this.handleStopPhaseSatisfiedResponse(
        operation,
        ReplicaOperationResponseStatus.NOT_FOUND,
      );
    }

    const errorLike = response?.error || response;
    const errorMsg = this.normalizeErrorMessage(errorLike, 'Unknown error');
    if (this.deferDispatchRetry(operation, errorLike)) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        operation.operationId,
        {
          error: errorMsg,
        },
      );
    }
    await this.failOperation(operation, errorMsg);
    return this.buildFailedOperationResult(operation.operationId, errorMsg);
  }

  /**
   * Normalize whether a satisfied add-side REPLACE response still needs a
   * local source-removal resume on this owner.
   *
   * A create `COMPLETED` / `ALREADY_EXISTS` response can arrive after the
   * ACTIVE transition was already marked idempotent by another wakeup. If no
   * STOPPING transition or deferred retry lane is already armed, keep the
   * remove phase progressing from the local ACTIVE row instead of waiting for a
   * later authoritative reread.
   *
   * @param {Object} operation
   * @return {Object}
   * @private
   */
  buildCreateSatisfiedReplaceResumeDecision(operation) {
    const operationId = operation?.operationId || null;
    const replaceRemovePhase = this.repository.isReplaceRemovePhase(operation);
    const locallyOwned =
      Boolean(operation) && this.repository.isOperationLocallyOwned(operation);
    const stoppingCommitted = operationId ?
      this.operationWorkflowCoordinator.isTransitionIdempotent(
        operationId,
        WORKFLOW_STEP.STOPPING,
      ) :
      false;
    const safetyRetryArmed = operationId ?
      this.safetyDeferredRetryTimerByOperationId.has(operationId) :
      false;
    const dispatchRetryArmed = operationId ?
      this.dispatchRetryTimerByOperationId.has(operationId) :
      false;
    const activeReplaceRetryArmed = operationId ?
      this.priorityActiveReplaceRetryTimerByOperationId.has(operationId) :
      false;
    const transitionRetryArmed =
      Boolean(operationId) &&
      (this.transitionRetryTimerByOperationId.has(operationId) ||
        this.hasActiveTransitionRetryGrace(operationId));
    const shouldResume =
      replaceRemovePhase &&
      locallyOwned &&
      !stoppingCommitted &&
      !safetyRetryArmed &&
      !dispatchRetryArmed &&
      !activeReplaceRetryArmed &&
      !transitionRetryArmed;
    return Object.freeze({
      shouldResume,
      replaceRemovePhase,
      locallyOwned,
      stoppingCommitted,
      safetyRetryArmed,
      dispatchRetryArmed,
      activeReplaceRetryArmed,
      transitionRetryArmed,
    });
  }

  /**
   * Re-arm one bounded execute retry when a priority REPLACE remains at
   * ACTIVE after local create satisfaction handling.
   *
   * This closes the gap where an inline source-removal continuation does not
   * actually advance the durable row out of ACTIVE. Instead of leaving the
   * operation stranded until a later timeout sweep, schedule one guarded
   * resume that only re-enters execution while the row is still ACTIVE.
   *
   * @param {Object} operation
   * @return {void}
   * @private
   */
  ensurePriorityActiveReplaceRetryArmed(operation) {
    const operationId = operation?.operationId || null;
    if (
      operation?.workflowStep !== WORKFLOW_STEP.ACTIVE ||
      operation?.type !== OperationType.REPLACE ||
      !isPriorityControlPlanePartition({
        partitionId: operation?.partitionId,
      }) ||
      !this.repository.isOperationLocallyOwned(operation) ||
      this.safetyDeferredRetryTimerByOperationId.has(operationId) ||
      this.dispatchRetryTimerByOperationId.has(operationId) ||
      this.transitionRetryTimerByOperationId.has(operationId) ||
      this.hasActiveTransitionRetryGrace(operationId) ||
      this.priorityActiveReplaceRetryTimerByOperationId.has(operationId)
    ) {
      return;
    }
    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED,
      {
        operationId,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        delayMs: DISPATCH_RETRY_DELAY_MS,
        boundary:
          OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_ACTIVE_REPLACE_RESUME,
      },
    );
    const timerHandle = this.setTimeoutFn(() => {
      this.priorityActiveReplaceRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
        return;
      }
      return this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        async () => {
          const visibilityObservation =
            await this.repository.getOperationByIdVisibilityObservation(
              operationId,
              {
                requireOwnerRpcRead: false,
                allowPriorityRecoveryDeferredVisibility: true,
              },
            );
          const currentOperation = visibilityObservation?.operation || null;
          if (
            !currentOperation ||
            this.repository.isOperationTerminal(currentOperation) ||
            !this.repository.isOperationLocallyOwned(currentOperation) ||
            currentOperation.type !== OperationType.REPLACE ||
            currentOperation.workflowStep !== WORKFLOW_STEP.ACTIVE ||
            !isPriorityControlPlanePartition({
              partitionId: currentOperation.partitionId,
            })
          ) {
            return;
          }
          await this.runOperationOwnerAction(
            OPERATION_OWNER_ACTION.EXECUTE,
            currentOperation,
            {
              boundary:
                OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_ACTIVE_REPLACE_RESUME,
              workflowStep: currentOperation.workflowStep || null,
              partitionId: currentOperation.partitionId || null,
              runInlineWhenOwnerLaneHeld: true,
            },
          );
        },
      ).catch((retryError) => {
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED,
          {
            operationId,
            partitionId: operation?.partitionId || null,
            workflowStep: operation?.workflowStep || null,
            boundary:
              OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_ACTIVE_REPLACE_RESUME,
            error:
              retryError?.message || retryError?.error || String(retryError),
          },
        );
      });
    }, DISPATCH_RETRY_DELAY_MS);
    this.priorityActiveReplaceRetryTimerByOperationId.set(
      operationId,
      timerHandle,
    );
  }

  /**
   * Treat create-phase idempotent satisfaction as observed target truth. If
   * the durable step write is retryably backpressured, re-arm
   * observed-progress reconciliation directly instead of redispatching
   * duplicate create work.
   *
   * @param {Object} operation
   * @param {string} responseStatus
   * @return {Promise<Object>}
   * @private
   */
  async handleCreatePhaseSatisfiedResponse(operation, responseStatus) {
    try {
      await this.applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);
      const replaceResumeDecision =
        this.buildCreateSatisfiedReplaceResumeDecision(operation);
      let replaceResumeResult = null;
      if (replaceResumeDecision.shouldResume) {
        replaceResumeResult =
          await this.executeOperationFromReconcilePath(operation);
      }
      if (replaceResumeResult?.skipped === true) {
        this.ensurePriorityActiveReplaceRetryArmed(operation);
      }
      return this.buildSuccessfulOperationResult(operation.operationId, {
        status: responseStatus,
      });
    } catch (error) {
      if (
        this.deferObservedProgressRetry(
          operation?.operationId || null,
          SYSTEM_TABLE_NAME.SERVICES,
          OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT,
          error,
        )
      ) {
        return this.buildSkippedOperationResult(
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          operation?.operationId || null,
          {
            error: this.normalizeErrorMessage(
              error,
              OPERATION_WORKFLOW_OWNER_LITERAL.RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE,
            ),
          },
        );
      }
      throw error;
    }
  }

  /**
   * Treat stop-phase absent-source responses as terminal truth, while ordinary
   * completion responses only advance to STOPPING until service visibility
   * confirms source retirement.
   *
   * @param {Object} operation
   * @param {string} responseStatus
   * @return {Promise<Object>}
   * @private
   */
}

export {OperationWorkflowOwnerSegment4};
