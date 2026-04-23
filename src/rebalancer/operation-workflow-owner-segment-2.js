import { OPERATION_WORKFLOW_OWNER_SHARED } from "./operation-workflow-owner-shared.js";
import { OperationWorkflowOwnerSegment1 } from "./operation-workflow-owner-segment-1.js";

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

class OperationWorkflowOwnerSegment2 extends OperationWorkflowOwnerSegment1 {
  deferCoordinatorCreatedRemoteHandoffRetry(operation, errorLike) {
    const operationId = operation?.operationId || null;
    if (
      !operationId ||
      !this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) ||
      !isRetryableControlPlaneError(errorLike)
    ) {
      return false;
    }
    if (this.createdOperationHandoffRetryTimerByOperationId.has(operationId)) {
      return true;
    }

    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    const delayMs =
      Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO
        ? retryAfterMs
        : DISPATCH_RETRY_DELAY_MS;
    const errorMessage = this.normalizeErrorMessage(
      errorLike,
      REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
    );

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED,
      {
        operationId,
        partitionId: operation?.partitionId || null,
        targetNodeId: operation?.targetNodeId || null,
        workflowStep: operation?.workflowStep || null,
        delayMs,
        errorMessage,
        boundary:
          OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
      },
    );

    return this.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
      operation,
      delayMs,
    );
  }

  /**
   * @param {Object|null} operation
   * @param {Error|Object} error
   * @private
   */
  handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(operation, error) {
    if (this.deferCoordinatorCreatedRemoteHandoffRetry(operation, error)) {
      return;
    }
    this.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED,
      {
        operationId: operation?.operationId || null,
        partitionId: operation?.partitionId || null,
        workflowStep: operation?.workflowStep || null,
        error: error?.message || error?.error || String(error),
        boundary:
          OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
      },
    );
  }

  /**
   * @param {Object|null} operation
   * @return {Promise<boolean>}
   * @private
   */
  async wakeCoordinatorCreatedRemoteOwner(operation) {
    if (
      !operation?.operationId ||
      !this.messageRouter ||
      typeof this.messageRouter.deliver !== TYPEOF.FUNCTION
    ) {
      return false;
    }

    const ownerNodeId =
      this.resolveCoordinatorCreatedOperationOwnerNodeId(operation);
    const target = this.buildCoordinatorCreatedDispatchIngress(ownerNodeId);
    if (!target) {
      return false;
    }

    const deliveryOptions = {
      targetNodeId: ownerNodeId,
    };
    if (
      isPriorityControlPlanePartition({
        partitionId: operation.partitionId || null,
      })
    ) {
      deliveryOptions.deliveryPriority =
        OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL;
    }

    try {
      const response = classifyTransportDeliveryOutcome(
        await this.messageRouter.deliver(
          target,
          {
            type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
            [ControlPlaneField.OPERATION_ID]: operation.operationId,
            [ControlPlaneField.OPERATION_ROW]:
              this.buildCoordinatorCreatedDispatchRow(operation),
          },
          deliveryOptions,
        ),
      );

      if (!isDeliveredTransportDeliveryOutcome(response)) {
        const handoffError = response?.error || response;
        if (
          this.deferCoordinatorCreatedRemoteHandoffRetry(
            operation,
            handoffError,
          )
        ) {
          return false;
        }
        throw new Error(
          this.normalizeErrorMessage(
            handoffError,
            REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
          ),
        );
      }

      this.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
        operation,
        COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
        {
          replaceExisting: true,
        },
      );
      return true;
    } catch (error) {
      if (this.deferCoordinatorCreatedRemoteHandoffRetry(operation, error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Prime a newly created locally owned operation onto the canonical owner
   * transition lane so it does not wait for cache visibility or external
   * dispatch observation before leaving PENDING.
   *
   * The coordinator-created event remains the actual dispatch trigger. This
   * hook only claims the durable workflow step through the owner path.
   *
   * @param {Object|null} operationInput
   * @return {Promise<boolean>}
   */
  async armCoordinatorCreatedOperation(operationInput) {
    const operationId = operationInput?.operationId || null;
    if (!operationId || this.isShuttingDown || !this.isInitialized) {
      return false;
    }

    const partitionId = operationInput?.partitionId || null;
    const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);

    try {
      return await this.operationWorkflowRunExclusive(
        singleFlightKey,
        async () => {
          let operation = await this.repository.queryAuthoritativeOperationById(
            operationId,
            {
              requireOwnerRpcRead: false,
            },
          );
          if (!operation) {
            operation = this.cloneOperationSnapshot(operationInput);
          }
          if (
            !operation ||
            this.repository.isOperationTerminal(operation) ||
            operation.workflowStep !== WORKFLOW_STEP.PENDING
          ) {
            return false;
          }

          if (this.isCoordinatorCreatedOperationLocallyOwned(operation)) {
            this.clearCreatedOperationHandoffRetry(operationId);
            try {
              const claimedOperation =
                await this.claimPendingDispatchOperation(operation);
              return Boolean(claimedOperation);
            } catch (error) {
              if (
                this.deferTransitionRetry(operationId, error, {
                  boundary:
                    OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_OPERATION,
                  workflowStep: operationInput?.workflowStep || null,
                  partitionId,
                  updatedAt: operationInput?.updatedAt,
                  createdAt: operationInput?.createdAt,
                })
              ) {
                return false;
              }
              throw error;
            }
          }

          if (
            this.isDispatchRetryableWorkflowStep(operation) &&
            this.isOperationStepTimedOut(operation, Date.now())
          ) {
            this.clearCreatedOperationHandoffRetry(operationId);
            return false;
          }

          return this.wakeCoordinatorCreatedRemoteOwner(operation);
        },
      );
    } catch (error) {
      if (
        this.deferCoordinatorCreatedRemoteHandoffRetry(operationInput, error)
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * @param {string} operationId
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Error|Object} error
   */
  handleObservedProgressFailure(operationId, tableName, cacheOperation, error) {
    if (
      this.deferObservedProgressRetry(
        operationId,
        tableName,
        cacheOperation,
        error,
      )
    ) {
      return;
    }
    if (
      this.deferTransitionRetry(operationId, error, {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
        workflowStep: null,
        partitionId: null,
      })
    ) {
      return;
    }
    this.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.OBSERVED_PROGRESS_TRANSITION_FAILED,
      {
        operationId,
        tableName,
        cacheOperation,
        error: error.message,
      },
    );
  }

  /**
   * @param {string} operationId
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Error|Object} errorLike
   * @return {boolean}
   */
  deferObservedProgressRetry(
    operationId,
    tableName,
    cacheOperation,
    errorLike,
  ) {
    if (!operationId || !isRetryableControlPlaneError(errorLike)) {
      return false;
    }
    if (this.observedProgressRetryTimerByOperationId.has(operationId)) {
      return true;
    }
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    const delayMs =
      Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO
        ? retryAfterMs
        : OBSERVED_PROGRESS_RETRY_DELAY_MS;
    const timerHandle = this.setTimeoutFn(() => {
      this.observedProgressRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || !this.isInitialized) {
        return;
      }
      return this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        () => this.reconcileObservedProgressOperation(operationId),
      ).catch((error) => {
        this.handleObservedProgressFailure(
          operationId,
          tableName,
          cacheOperation,
          error,
        );
      });
    }, delayMs);
    this.observedProgressRetryTimerByOperationId.set(operationId, timerHandle);
    return true;
  }

  /**
   * Resolve the best available replica status for workflow reconciliation.
   * Prefer authoritative reads, but fall back to the observed services cache
   * when the exact target row becomes visible there first.
   *
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<string|null>}
   */
  async getReconciledReplicaStatus(replicaId, partitionId, targetNodeId) {
    const shouldPreferLocalPriorityReplicaObservation =
      targetNodeId === this.nodeId &&
      isPriorityControlPlanePartition({partitionId});
    if (
      shouldPreferLocalPriorityReplicaObservation &&
      this.repository &&
      typeof this.repository.getActualReplicaObservation === TYPEOF.FUNCTION
    ) {
      const localObservation = await this.repository.getActualReplicaObservation(
        replicaId,
        partitionId,
        targetNodeId,
        {
          authoritativeReadMode:
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
          allowCacheFallback: false,
        },
      );
      if (localObservation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED) {
        return localObservation.lifecycleStatus;
      }
    }
    if (
      this.repository &&
      typeof this.repository.getActualReplicaObservation === TYPEOF.FUNCTION
    ) {
      const observation = await this.repository.getActualReplicaObservation(
        replicaId,
        partitionId,
        targetNodeId,
      );
      if (observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED) {
        return observation.lifecycleStatus;
      }
    }
    const actualStatus = await this.getActualReplicaStatus(
      replicaId,
      partitionId,
      targetNodeId,
    );
    if (actualStatus !== null) {
      return actualStatus;
    }
    return this.repository.getObservedReplicaStatusFromCache(
      replicaId,
      partitionId,
      targetNodeId,
    );
  }

  // --- Single-flight key construction ---

  /**
   * Build one operation single-flight key.
   * @param {string} scope - Lock scope prefix.
   * @param {string} key - Scope-specific key.
   * @return {string}
   */
  buildOperationSingleFlightKey(scope, key) {
    return [scope, key].join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
  }

  /**
   * @param {string} dedupeKey
   * @return {string}
   */
  getCreateOperationSingleFlightKey(dedupeKey) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.CREATE,
      dedupeKey,
    );
  }

  /**
   * @param {string} scope
   * @return {string}
   */
  getCreateBudgetSingleFlightKey(scope) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.CREATE_BUDGET,
      scope,
    );
  }

  /**
   * @param {string} operationId
   * @return {string}
   */
  getExecuteOperationSingleFlightKey(operationId) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.OPERATION,
      operationId,
    );
  }

  /**
   * @param {string} operationId
   * @return {string}
   */
  getOperationOwnerSingleFlightKey(operationId) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.OPERATION,
      operationId,
    );
  }

  /**
   * @param {string|null} operationId
   * @return {boolean}
   * @private
   */
  isOperationOwnerLaneHeld(operationId) {
    const singleFlightKey = operationId
      ? this.getOperationOwnerSingleFlightKey(operationId)
      : null;
    const inFlightOwnerKeys =
      this.operationWorkflowCoordinator?.inFlightExecutionsByOwnerKey;
    return Boolean(
      singleFlightKey &&
      inFlightOwnerKeys instanceof Map &&
      inFlightOwnerKeys.has(singleFlightKey),
    );
  }

  /**
   * @param {string} action
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   * @private
   */
  invokeOperationOwnerActionInternal(action, operationInput) {
    if (action === OPERATION_OWNER_ACTION.DISPATCH) {
      return this.dispatchOperationInternal(operationInput);
    }
    if (action === OPERATION_OWNER_ACTION.EXECUTE) {
      return this.executeOperationInternal(operationInput);
    }
    throw new Error(`Unknown operation owner action: ${action}`);
  }

  /**
   * Route one dispatch/execute request through the canonical owner lane.
   * Reconcile callers may execute inline when they already hold the owner key.
   *
   * @param {string} action
   * @param {string|Object} operationInput
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async runOperationOwnerAction(action, operationInput, options = {}) {
    const operationId = this.getOperationIdFromInput(operationInput);
    const ownerLaneHeld = this.isOperationOwnerLaneHeld(operationId);

    if (ownerLaneHeld && options.skipWhenOwnerLaneHeld === true) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.OPERATION_ALREADY_EXECUTING,
        operationId,
      );
    }

    const invokeAction = () =>
      this.invokeOperationOwnerActionInternal(action, operationInput);

    try {
      if (
        !operationId ||
        (ownerLaneHeld && options.runInlineWhenOwnerLaneHeld === true)
      ) {
        return await invokeAction();
      }
      return await this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        invokeAction,
      );
    } catch (error) {
      if (
        this.deferTransitionRetry(operationId, error, {
          boundary: options.boundary || action,
          workflowStep: options.workflowStep || null,
          partitionId: options.partitionId || null,
          updatedAt: operationInput?.updatedAt,
          createdAt: operationInput?.createdAt,
          operationSnapshot:
            operationInput &&
            typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT ?
              operationInput :
              null,
        })
      ) {
        return this.buildSkippedOperationResult(
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          operationId,
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
   * Build one skipped-operation result.
   * @param {string} reason
   * @param {string|null} operationId
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildSkippedOperationResult(reason, operationId, extra = {}) {
    return {
      success: false,
      skipped: true,
      reason,
      operationId,
      ...extra,
    };
  }

  /**
   * Build one successful operation result.
   * @param {string|null} operationId
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildSuccessfulOperationResult(operationId, extra = {}) {
    return {
      success: true,
      operationId,
      ...extra,
    };
  }

  /**
   * Build one failed operation result.
   * @param {string|null} operationId
   * @param {string|Error|Object} error
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildFailedOperationResult(operationId, error, extra = {}) {
    return {
      success: false,
      operationId,
      error,
      ...extra,
    };
  }

  /**
   * Delay authoritative empty-owner scans until the cache has had one bounded
   * chance to observe local replica_operations rows. An empty cache is not
   * proof of zero operations; it is only a reason to wait briefly.
   * @param {number} [now=Date.now()]
   * @return {boolean}
   */
  shouldDelayEmptyIncompleteOperationQuery(now = Date.now()) {
    if (this.incompleteOperationQueryEmptyBackoffMs <= NUM.ZERO) {
      return false;
    }
    if (this.lastEmptyIncompleteOperationQueryAtMs <= NUM.ZERO) {
      this.lastEmptyIncompleteOperationQueryAtMs = now;
      return true;
    }
    if (
      now - this.lastEmptyIncompleteOperationQueryAtMs <
      this.incompleteOperationQueryEmptyBackoffMs
    ) {
      return true;
    }
    this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    return false;
  }

  /**
   * Clear bounded empty-owner scan deferral once local work is observed.
   * @return {void}
   */
  clearEmptyIncompleteOperationQueryDelay() {
    this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
  }

  // --- Workflow step advancement ---

  /**
   * Register an operation as a workflow if not already tracked.
   * @param {Object} operation - Operation record.
   */
  ensureOperationWorkflow(operation) {
    const workflowId = operation.operationId;
    if (this.operationWorkflowCoordinator.getWorkflowById(workflowId)) {
      return;
    }
    const record = {
      workflowId,
      ownerKey: workflowId,
      step: operation.workflowStep || null,
      transitionHistory: [],
    };
    const workflow =
      this.operationWorkflowCoordinator.createWorkflowRecord(record);
    this.operationWorkflowCoordinator.setWorkflowState(workflow);
  }

  /**
   * Resolve a canonical transition reason from step progression.
   * @param {string} previousStep
   * @param {string} nextStep
   * @return {string}
   */
  resolveTransitionReason(previousStep, nextStep) {
    if (nextStep === WORKFLOW_STEP.SENDING) {
      return OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
    }
    if (nextStep === WORKFLOW_STEP.CREATING) {
      return OPERATION_TRANSITION_REASON.DISPATCH_CREATING;
    }
    if (nextStep === WORKFLOW_STEP.STOPPING) {
      return OPERATION_TRANSITION_REASON.DISPATCH_STOPPING;
    }
    if (
      nextStep === WORKFLOW_STEP.ACTIVE &&
      previousStep === WORKFLOW_STEP.SYNCING
    ) {
      return OPERATION_TRANSITION_REASON.RECONCILE_ACTIVE;
    }
    if (nextStep === WORKFLOW_STEP.ACTIVE) {
      return OPERATION_TRANSITION_REASON.DISPATCH_ALREADY_EXISTS;
    }
    if (nextStep === WORKFLOW_STEP.REMOVED) {
      return OPERATION_TRANSITION_REASON.OPERATION_COMPLETED;
    }
    if (nextStep === WORKFLOW_STEP.FAILED) {
      return OPERATION_TRANSITION_REASON.OPERATION_FAILED;
    }
    return OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
  }

  /**
   * Build one stable owner key for transition-attempt tracking.
   * @param {string} operationId
   * @param {string} step
   * @return {string}
   */
  buildTransitionExecutionStepOwnerKey(operationId, step) {
    return [
      String(operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
      String(step || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
    ].join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
  }

  /**
   * Get or allocate the current execution attempt number for one
   * operation/step key.
   * @param {string} operationId
   * @param {string} step
   * @return {number}
   */
  reserveTransitionExecutionAttempt(operationId, step) {
    const ownerKey = this.buildTransitionExecutionStepOwnerKey(
      operationId,
      step,
    );
    const currentAttempt =
      this.transitionExecutionAttemptByStepOwnerKey.get(ownerKey);
    if (Number.isInteger(currentAttempt) && currentAttempt >= NUM.ONE) {
      return currentAttempt;
    }
    this.transitionExecutionAttemptByStepOwnerKey.set(ownerKey, NUM.ONE);
    return NUM.ONE;
  }

  /**
   * Rotate the execution attempt number after a direct session collision.
   * @param {string} operationId
   * @param {string} step
   * @return {number}
   */
  rotateTransitionExecutionAttempt(operationId, step) {
    const ownerKey = this.buildTransitionExecutionStepOwnerKey(
      operationId,
      step,
    );
    const nextAttempt =
      this.reserveTransitionExecutionAttempt(operationId, step) + NUM.ONE;
    this.transitionExecutionAttemptByStepOwnerKey.set(ownerKey, nextAttempt);
    return nextAttempt;
  }

  /**
   * Rotate the transition execution attempt after a stale-session collision and
   * emit one canonical diagnostic with the next attempt number.
   * @param {string} operationId
   * @param {string} step
   * @param {string} sessionId
   * @param {*} errorLike
   * @return {number}
   */
  rotateTransitionExecutionAttemptAfterStaleSessionConflict(
    operationId,
    step,
    sessionId,
    errorLike,
  ) {
    const nextAttempt = this.rotateTransitionExecutionAttempt(
      operationId,
      step,
    );
    this.logger?.warn?.(
      OPERATION_WORKFLOW_OWNER_LITERAL.ROTATING_TRANSITION_EXECUTION_SESSION_AFTER_STALE_SESSION_COLLISION,
      {
        operationId,
        workflowStep: step,
        sessionId,
        nextAttempt,
        error: this.normalizeErrorMessage(
          errorLike,
          OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
        ),
      },
    );
    return nextAttempt;
  }

  /**
   * Clear tracked attempt state after a committed transition.
   * @param {string} operationId
   * @param {string} step
   * @return {void}
   */
  clearTransitionExecutionAttempt(operationId, step) {
    const ownerKey = this.buildTransitionExecutionStepOwnerKey(
      operationId,
      step,
    );
    this.transitionExecutionAttemptByStepOwnerKey.delete(ownerKey);
  }

  /**
   * Build one attempt-scoped transition session id.
   * @param {string} operationId
   * @param {string} step
   * @param {number} executionAttempt
   * @return {string}
   */
  buildTransitionExecutionSessionId(operationId, step, executionAttempt) {
    return [
      String(operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
      String(step || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING),
      OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX + String(executionAttempt),
    ].join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
  }

  /**
   * Clamp transition-owned replica_operations writes to the enclosing
   * distributed transaction deadline so inner retry loops do not outlive
   * the parent transaction and mask the original contention boundary.
   * @param {string} sessionId
   * @return {Object|null}
   */
  buildTransitionMutationTimeoutBudget(sessionId) {
    if (
      typeof this.transactionCoordinator?.getTransaction !== TYPEOF.FUNCTION
    ) {
      return null;
    }
    const transactionState =
      this.transactionCoordinator.getTransaction(sessionId);
    const deadlineMs = Number.isFinite(transactionState?.timeoutDeadline)
      ? Math.floor(transactionState.timeoutDeadline)
      : null;
    if (!Number.isFinite(deadlineMs)) {
      return null;
    }
    const startedAtMs = Date.now();
    return Object.freeze({
      configuredBudgetMs: Math.max(
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        deadlineMs - startedAtMs,
      ),
      startedAtMs,
      deadlineMs,
      operationName: OPERATION_WORKFLOW_OWNER_LITERAL.TRANSACTION,
    });
  }

  /**
   * Build canonical persistence options for transition-owned
   * replica_operations mutations so every transition path shares the same
   * enclosing transaction budget clamp.
   * @param {string} sessionId
   * @return {Object}
   */
  buildTransitionPersistOptions(sessionId) {
    const persistOptions = {
      sessionId,
      confirmPersistence: false,
      timeoutBudget: this.buildTransitionMutationTimeoutBudget(sessionId),
    };
    if (typeof sessionId !== TYPEOF.STRING || sessionId.length <= NUM.ZERO) {
      delete persistOptions.sessionId;
    }
    return persistOptions;
  }

  /**
   * Transaction-control recovery partitions must not route their own
   * replica_operations step transitions back through the distributed
   * transaction tables they are still converging.
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldBypassTransitionExecutionTransaction(operation) {
    const partitionId =
      typeof operation?.partitionId === TYPEOF.STRING
        ? operation.partitionId
        : OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
    return DIRECT_TRANSITION_PERSIST_PARTITION_IDS.has(partitionId);
  }

  /**
   * Build canonical persistence options for one transition-owned
   * replica_operations mutation.
   * @param {Object|null} operation
   * @param {string|null} sessionId
   * @return {Object}
   * @private
   */
  buildOperationTransitionPersistOptions(operation, sessionId) {
    const persistOptions = this.buildTransitionPersistOptions(sessionId);
    if (this.shouldBypassTransitionExecutionTransaction(operation)) {
      const directPersistOptions = {
        ...persistOptions,
        disableSystemWriteSession: true,
      };
      delete directPersistOptions.sessionId;
      return directPersistOptions;
    }
    return persistOptions;
  }

  /**
   * Confirm one committed transition best-effort so post-commit visibility
   * lag cannot unwind a transition that already durably committed.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async confirmCommittedTransitionPersistence(operation) {
    try {
      await this.repository.confirmReplicaOperationPersistence(operation);
    } catch (error) {
      this.logger.warn(
        OPERATION_WORKFLOW_OWNER_LITERAL.COMMITTED_REPLICA_OPERATION_TRANSITION_NOT_YET_AUTHORITATIVELY_VISIBLE,
        {
          operationId: operation?.operationId || null,
          workflowStep: operation?.workflowStep || null,
          status: operation?.status || null,
          error: error?.message || String(error),
        },
      );
    }
  }

  /**
   * Check whether a transition failure indicates a stale session id that
   * should rotate on the next retry.
   * @param {*} errorLike
   * @return {boolean}
   */
  isStaleTransitionSessionConflict(errorLike) {
    const message = this.normalizeErrorMessage(errorLike, "");
    return message === QUERY_ERROR_MSG.TRANSACTION_ACTIVE;
  }

  /**
   * Partition transaction contention can be caused either by a stale same-
   * session transaction or by unrelated control-plane pressure. Treat it as
   * retryable, but do not assume it warrants a new canonical session id.
   * @param {*} errorLike
   * @return {boolean}
   */
  isTransitionPartitionContention(errorLike) {
    return (
      this.normalizeErrorMessage(
        errorLike,
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
      ) === PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE
    );
  }

  /**
   * Attempt same-session recovery without masking the original transition
   * failure when the recovery probe itself is unavailable.
   * @param {string} sessionId
   * @param {*} errorLike
   * @param {Object} [options]
   * @param {boolean} [options.allowAuthoritativeLookup=false]
   * @return {Promise<boolean>}
   * @private
   */
  async tryRecoverTransitionExecutionSession(
    sessionId,
    errorLike,
    options = {},
  ) {
    try {
      return await this.recoverTransitionExecutionSession(sessionId, options);
    } catch (recoveryError) {
      this.logger.warn(
        OPERATION_WORKFLOW_OWNER_LITERAL.TRANSITION_SESSION_RECOVERY_PROBE_FAILED,
        {
          sessionId,
          error: recoveryError?.message || String(recoveryError),
          originalError: this.normalizeErrorMessage(
            errorLike,
            OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
          ),
        },
      );
      return false;
    }
  }

  /**
   * Load authoritative in-flight transaction state for one transition session
   * when the local coordinator cache has already dropped that session.
   * @param {string} sessionId
   * @return {Promise<Object|null>}
   */
}

export { OperationWorkflowOwnerSegment2 };
