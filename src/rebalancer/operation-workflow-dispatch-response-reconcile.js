import {REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS} from './replica-operation-step-policy.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';
import {
  isBoundMembershipPublicationEpoch,
} from './replica-operation-membership-epoch-binding.js';
const {
  DISPATCH_RETRY_DELAY_MS,
  FAILURE_LOG_LEVEL,
  OPERATION_OWNER_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  OperationType,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_LOG_MSG,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_RETRY_AFTER_MS,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  TRANSPORT_ERROR_MSG,
  WORKFLOW_STEP,
  buildHandoffDeferralTransportDiagnostics,
  classifySystemPartition,
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
  resolveOperationHandlerType,
} = OPERATION_WORKFLOW_OWNER_SHARED;
// Bounded memory for the first-attempt dispatch log discrimination; clearing
// on overflow only means one extra info line per live operation step.
const SEND_OPERATION_LOG_KEY_CAP = 2048;

/**
 * The first dispatch attempt per (operation, step) logs at info so run
 * forensics can distinguish "never dispatched" from "dispatch retrying"
 * without debug logging (run-22's silence was exactly this ambiguity);
 * retries stay at debug to avoid retry-loop flood. Module-level on purpose:
 * this file's methods run `.call(owner)`-delegated, so only exported names
 * exist on the owner instance.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} payload
 * @return {void}
 */
function logSendOperationAttempt(owner, operation, payload) {
  const sendOperationLogKey =
    `${operation.operationId}:${operation.workflowStep || ''}`;
  if (!owner.sendOperationInfoLoggedKeys) {
    owner.sendOperationInfoLoggedKeys = new Set();
  }
  if (owner.sendOperationInfoLoggedKeys.size > SEND_OPERATION_LOG_KEY_CAP) {
    owner.sendOperationInfoLoggedKeys.clear();
  }
  const firstAttemptForStep =
    !owner.sendOperationInfoLoggedKeys.has(sendOperationLogKey);
  owner.sendOperationInfoLoggedKeys.add(sendOperationLogKey);
  const sendOperationLog = firstAttemptForStep ?
    owner.logger.info.bind(owner.logger) :
    owner.logger.debug.bind(owner.logger);
  sendOperationLog(REBALANCE_COORDINATOR_LOG_MSG.SEND_OPERATION, {
    ...payload,
    firstAttemptForStep,
  });
}
const CREATE_IN_PROGRESS_OBSERVED_RECONCILE_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.SYNCING,
    ReplicaStatus.ACTIVE,
    ReplicaStatus.FAILED,
  ]),
);
const CREATE_IN_PROGRESS_OBSERVED_RETRY_STATUSES = Object.freeze(
  new Set([ReplicaStatus.SYNCING]),
);
function resolveDispatchDeliveryErrorLike(response) {
  if (!response || typeof response !== 'object') {
    return response;
  }
  const nestedError = response.error;
  if (!nestedError || typeof nestedError !== 'object') {
    return response;
  }
  return {
    ...response,
    ...nestedError,
    error:
      typeof nestedError.message === 'string' ?
        nestedError.message :
        response.error,
    cause: nestedError,
  };
}
function buildReplicaOperationDispatchTimeoutError(operation) {
  const error = new Error(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT);
  error.code = ROUTER_MESSAGE_TIMEOUT_ERROR_CODE;
  error.errorCode = ROUTER_MESSAGE_TIMEOUT_ERROR_CODE;
  error.deferRetry = true;
  error.retryAfterMs = REPLICA_OPERATION_DISPATCH_TIMEOUT_RETRY_AFTER_MS;
  error.operationId = operation?.operationId;
  return error;
}
const DISPATCH_RESPONSE_RECONCILE_METHODS = {
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
  },
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
  },
  shouldBoundReplicaOperationDispatch(operation) {
    const partitionId = operation?.partitionId || null;
    const partitionClassification = classifySystemPartition({partitionId});
    return (
      partitionClassification.systemTable ||
      partitionClassification.priorityControlPlane
    );
  },
  buildReplicaOperationDispatchOptions(operation, dispatchNodeId) {
    const options = {
      targetNodeId: dispatchNodeId,
      // Replica operation dispatch is the control-plane progress signal that
      // advances split/rebalance workflows. It must preempt bulk metadata
      // replication from transaction bookkeeping.
      deliveryPriority: OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL,
    };
    if (this.shouldBoundReplicaOperationDispatch(operation)) {
      options.timeoutMs = this.replicaOperationDispatchTimeoutMs;
      options.deliverySource =
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_OPERATION_DISPATCH;
    }
    return options;
  },
  async awaitReplicaOperationDispatchDeadline(
    operation,
    deliveryPromise,
  ) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(this.buildReplicaOperationDispatchTimeoutError(operation));
      }, this.replicaOperationDispatchTimeoutMs);
    });
    try {
      return await Promise.race([deliveryPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  },
  async deliverReplicaOperationRequest(
    operation,
    target,
    request,
    dispatchNodeId,
  ) {
    const deliveryOptions = this.buildReplicaOperationDispatchOptions(
      operation,
      dispatchNodeId,
    );
    const deliveryPromise = this.messageRouter.deliver(
      target,
      request,
      deliveryOptions,
    );
    if (!this.shouldBoundReplicaOperationDispatch(operation)) {
      return deliveryPromise;
    }
    return this.awaitReplicaOperationDispatchDeadline(
      operation,
      deliveryPromise,
    );
  },
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
    const removeRedriveDispatchPhase =
      operation.type === OperationType.REMOVE &&
      REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS.has(operation.workflowStep);
    const createRearmDispatchPhase =
      this.isCreateRearmDispatchPhase(operation);
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
      !removeRedriveDispatchPhase &&
      !createRearmDispatchPhase
    ) {
      if (operation.workflowStep === WORKFLOW_STEP.PENDING) {
        const claimedOperation =
          await this.claimPendingDispatchOperation(operation);
        if (!claimedOperation) {
          return this.buildSkippedOperationResult(
            this.isOperationDeferredRetryActive(operation.operationId) ?
              REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING :
              OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
            operation.operationId,
          );
        }
        operation = claimedOperation;
      } else {
        await this.updateStep(operation, WORKFLOW_STEP.SENDING);
      }
    }
    let removeSafetyEvaluation = await this.evaluateRemoveSafety(operation);
    if (removeSafetyEvaluation?.error) {
      if (
        removeSafetyEvaluation.classification ===
        REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER
      ) {
        let handoffResponse = null;
        if (removeSafetyEvaluation.handoffRequest) {
          handoffResponse = await this.dispatchRemoveSafetyHandoffRequest(
            operation,
            removeSafetyEvaluation.handoffRequest,
          );
        }
        if (
          typeof this.shouldContinueAfterRemoveSafetyHandoffResponse ===
            OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION &&
          await this.shouldContinueAfterRemoveSafetyHandoffResponse(
            operation,
            removeSafetyEvaluation,
            handoffResponse,
          )
        ) {
          const refreshedRemoveSafetyEvaluation =
            await this.evaluateRemoveSafety(operation);
          if (!refreshedRemoveSafetyEvaluation?.error) {
            removeSafetyEvaluation = refreshedRemoveSafetyEvaluation;
          }
        }
        if (
          this.shouldFailRemoveSafetyHandoffResponse(
            removeSafetyEvaluation,
            handoffResponse,
          )
        ) {
          const handoffFailureError =
            this.resolveRemoveSafetyHandoffFailureError(
              removeSafetyEvaluation,
            );
          await this.failOperation(operation, handoffFailureError, {
            logLevel: FAILURE_LOG_LEVEL.WARN,
            logMessage:
              REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY,
          });
          return this.buildFailedOperationResult(
            operation.operationId,
            handoffFailureError,
          );
        }
        if (!removeSafetyEvaluation?.error) {
          this.clearDeferredSafetyBlockState(operation.operationId);
        } else {
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
      }
      if (removeSafetyEvaluation?.error) {
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
    }
    this.clearDeferredSafetyBlockState(operation.operationId);
    const {entityType, entityId} =
      assertCanonicalRebalancerEntityIdentity(operation);
    const handlerType = resolveOperationHandlerType(entityType);
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
        requestReason =
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLACE_SOURCE_REMOVAL;
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
        'Missing source replica for REPLACE operation ' +
        operation.operationId;
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
    // Carry the planning epoch into the executor request (audit finding 7)
    // so ADD/REPLACE execution can reject staleness against it.
    if (
      isBoundMembershipPublicationEpoch(
        operation[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
      )
    ) {
      request[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH] =
        operation[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH];
    }
    if (requestReason) {
      request[ReplicaOperationField.REASON] = requestReason;
    }
    if (
      Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]) &&
      operation[ReplicaOperationField.REPLICA_IDS].length > 0
    ) {
      request[ReplicaOperationField.REPLICA_IDS] =
        operation[ReplicaOperationField.REPLICA_IDS];
    }
    if (
      Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]) &&
      operation[ReplicaOperationField.PEER_ADDRESSES].length > 0
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
    logSendOperationAttempt(this, operation, {
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
        await this.deliverReplicaOperationRequest(
          operation,
          target,
          request,
          dispatchNodeId,
        ),
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
      const errorLike = resolveDispatchDeliveryErrorLike(response);
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
    this.retainDeliveredCreateProgress(
      operation,
      response,
      replaceRemoveDispatchPhase,
    );
    return this._handleDispatchResponse(
      operation,
      response,
      replaceRemoveDispatchPhase,
    );
  },
  async _handleDispatchResponse(operation, response, replaceRemovePhase) {
    this.clearDispatchRetry(operation?.operationId);
    if (
      response.status === ReplicaOperationResponseStatus.INITIATED ||
      response.status === ReplicaOperationResponseStatus.IN_PROGRESS
    ) {
      if (
        response.status === ReplicaOperationResponseStatus.IN_PROGRESS &&
        await this.reconcileCreateInProgressDispatchResponse(
          operation,
          response,
          replaceRemovePhase,
        )
      ) {
        return this.buildSuccessfulOperationResult(operation.operationId, {
          status: OPERATION_WORKFLOW_OWNER_LITERAL.IN_PROGRESS,
        });
      }
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
    const errorLike = resolveDispatchDeliveryErrorLike(response);
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
  },
  buildCreateSatisfiedReplaceResumeDecision(operation) {
    const operationId = operation?.operationId || null;
    const replaceRemovePhase =
      this.repository.isReplaceRemovePhase(operation);
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
  },
  ensurePriorityActiveReplaceRetryArmed(operation) {
    const operationId = operation?.operationId || null;
    if (
      operation?.workflowStep !== WORKFLOW_STEP.ACTIVE ||
      operation?.type !== OperationType.REPLACE ||
      !classifySystemPartition({partitionId: operation?.partitionId})
        .priorityControlPlane ||
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
        ...buildHandoffDeferralTransportDiagnostics(this, operation, null),
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
                allowPriorityRecoveryDeferredVisibility: true,
              },
            );
          const currentOperation = this.resolveDeferredRetryVisibleOperation(
            visibilityObservation,
            operation,
          );
          if (
            !currentOperation ||
            this.repository.isOperationTerminal(currentOperation) ||
            !this.repository.isOperationLocallyOwned(currentOperation) ||
            currentOperation.type !== OperationType.REPLACE ||
            currentOperation.workflowStep !== WORKFLOW_STEP.ACTIVE ||
            !classifySystemPartition({
              partitionId: currentOperation.partitionId,
            }).priorityControlPlane
          ) {
            return;
          }
          await this.runOperationOwnerAction(
            OPERATION_OWNER_ACTION.EXECUTE,
            currentOperation,
            {
              boundary:
                OPERATION_WORKFLOW_OWNER_LITERAL
                  .PRIORITY_ACTIVE_REPLACE_RESUME,
              workflowStep: currentOperation.workflowStep || null,
              partitionId: currentOperation.partitionId || null,
              runInlineWhenOwnerLaneHeld: true,
            },
          );
        },
      ).catch((retryError) => {
        if (
          this.deferTransitionRetry(operationId, retryError, {
            boundary:
              OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_ACTIVE_REPLACE_RESUME,
            partitionId: operation?.partitionId || null,
            workflowStep: operation?.workflowStep || null,
            updatedAt: operation?.updatedAt,
            createdAt: operation?.createdAt,
            operationSnapshot: operation,
          })
        ) {
          return;
        }
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
  },
  async reconcileCreateInProgressDispatchResponse(
    operation,
    response,
    replaceRemovePhase = false,
  ) {
    if (
      operation?.type !== OperationType.ADD &&
      (
        operation?.type !== OperationType.REPLACE ||
        replaceRemovePhase === true
      )
    ) {
      return false;
    }
    if (
      typeof this.getObservedOperationRowTargetProgressStatus !==
        'function' ||
      typeof this.applyReconciledReplicaStatus !== 'function'
    ) {
      return false;
    }
    const observedTargetStatus =
      this.resolveCreateInProgressDispatchResponseStatus(
        operation,
        response,
      );
    if (
      !CREATE_IN_PROGRESS_OBSERVED_RECONCILE_STATUSES.has(
        observedTargetStatus,
      )
    ) {
      return false;
    }
    const reconciled = await this.applyReconciledReplicaStatus(
      operation,
      observedTargetStatus,
      {
        cause: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
      },
    );
    if (
      reconciled === true &&
      CREATE_IN_PROGRESS_OBSERVED_RETRY_STATUSES.has(observedTargetStatus)
    ) {
      this.scheduleObservedProgressRetry(
        operation.operationId,
        SYSTEM_TABLE_NAME.SERVICES,
        OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT,
      );
    }
    return reconciled;
  },
  resolveCreateInProgressDispatchResponseStatus(operation, response) {
    const responseReplicaStatus =
      response?.[ReplicaOperationField.REPLICA_STATUS];
    if (
      CREATE_IN_PROGRESS_OBSERVED_RECONCILE_STATUSES.has(
        responseReplicaStatus,
      )
    ) {
      return responseReplicaStatus;
    }
    return this.getObservedOperationRowTargetProgressStatus(operation);
  },
  async handleCreatePhaseSatisfiedResponse(operation, responseStatus) {
    try {
      await this.applyReconciledReplicaStatus(
        operation,
        ReplicaStatus.ACTIVE,
      );
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
              OPERATION_WORKFLOW_OWNER_LITERAL
                .RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE,
            ),
          },
        );
      }
      throw error;
    }
  },
};
const {
  _handleDispatchResponse,
  awaitReplicaOperationDispatchDeadline,
  buildCreateSatisfiedReplaceResumeDecision,
  buildReplicaOperationDispatchOptions,
  deliverReplicaOperationRequest,
  ensurePriorityActiveReplaceRetryArmed,
  executeOperation,
  executeOperationFromReconcilePath,
  executeOperationInternal,
  handleCreatePhaseSatisfiedResponse,
  reconcileCreateInProgressDispatchResponse,
  resolveCreateInProgressDispatchResponseStatus,
  shouldBoundReplicaOperationDispatch,
} = DISPATCH_RESPONSE_RECONCILE_METHODS;
export {
  _handleDispatchResponse,
  awaitReplicaOperationDispatchDeadline,
  buildCreateSatisfiedReplaceResumeDecision,
  buildReplicaOperationDispatchOptions,
  buildReplicaOperationDispatchTimeoutError,
  deliverReplicaOperationRequest,
  ensurePriorityActiveReplaceRetryArmed,
  executeOperation,
  executeOperationFromReconcilePath,
  executeOperationInternal,
  handleCreatePhaseSatisfiedResponse,
  reconcileCreateInProgressDispatchResponse,
  resolveCreateInProgressDispatchResponseStatus,
  shouldBoundReplicaOperationDispatch,
};
