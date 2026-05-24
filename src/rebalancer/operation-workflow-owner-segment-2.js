import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerSegment1} from './operation-workflow-owner-segment-1.js';
import {withOwnerHandoffState} from './operation-workflow-owner-handoff-state.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  NUM,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_OWNER_ACTION,
  OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR,
  OPERATION_SINGLE_FLIGHT_SCOPE,
  OPERATION_TRANSITION_REASON,
  OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  PARTITION_SERVICE_ERROR_MSG,
  QUERY_ERROR_MSG,
  REBALANCE_COORDINATOR_LOG_MSG,
  TIMEOUT_BUDGET_DEFAULT,
  TYPEOF,
  WORKFLOW_STEP,
  buildTopologyOperatorWitnessFromWorkflowProgress,
  getControlPlaneRetryAfterMs,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const LOCAL_PRIORITY_EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS =
  Object.freeze({
    ...EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
    allowCacheFallback: false,
  });

class OperationWorkflowOwnerSegment2 extends withOwnerHandoffState(OperationWorkflowOwnerSegment1) {
  buildTopologyOperatorWitnessFromWorkflowProgress(
    snapshot = {},
    options = {},
  ) {
    return buildTopologyOperatorWitnessFromWorkflowProgress(snapshot, options);
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
      Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO ?
        retryAfterMs :
        OBSERVED_PROGRESS_RETRY_DELAY_MS;
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
      const localObservation =
        await this.repository.getActualReplicaObservation(
          replicaId,
          partitionId,
          targetNodeId,
          LOCAL_PRIORITY_EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
        );
      if (
        localObservation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED
      ) {
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
        EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
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
      EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
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
    const singleFlightKey = operationId ?
      this.getOperationOwnerSingleFlightKey(operationId) :
      null;
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
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  invokeOperationOwnerActionInternal(action, operationInput, options = {}) {
    if (action === OPERATION_OWNER_ACTION.DISPATCH) {
      return this.dispatchOperationInternal(operationInput, options);
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
    const operationSnapshot =
      operationInput &&
      typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT ?
        operationInput :
        null;

    if (ownerLaneHeld && options.skipWhenOwnerLaneHeld === true) {
      return this.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.OPERATION_ALREADY_EXECUTING,
        operationId,
      );
    }

    const invokeAction = () =>
      this.invokeOperationOwnerActionInternal(
        action,
        operationInput,
        options,
      );

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
          workflowStep:
            options.workflowStep || operationSnapshot?.workflowStep || null,
          partitionId:
            options.partitionId || operationSnapshot?.partitionId || null,
          updatedAt: options.updatedAt || operationSnapshot?.updatedAt,
          createdAt: options.createdAt || operationSnapshot?.createdAt,
          operationSnapshot,
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
    const deadlineMs = Number.isFinite(transactionState?.timeoutDeadline) ?
      Math.floor(transactionState.timeoutDeadline) :
      null;
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
   * Normalize the partition id from either in-memory operation objects or
   * durable replica_operations rows before selecting the persistence lane.
   * @param {Object|null} operation
   * @return {string}
   * @private
   */
  resolveTransitionOperationPartitionId(operation) {
    const candidatePartitionIds = [
      operation?.partitionId,
      operation?.partition_id,
      operation?.entityId,
      operation?.entity_id,
    ];
    const partitionId = candidatePartitionIds.find(
      (candidate) =>
        typeof candidate === TYPEOF.STRING && candidate.length > NUM.ZERO,
    );
    return typeof partitionId === TYPEOF.STRING ?
      partitionId :
      OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
  }

  /**
   * Priority control-plane recovery partitions must not route their own
   * replica_operations step transitions back through the control-plane
   * tables they are still converging.
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldBypassTransitionExecutionTransaction(operation) {
    const partitionId = this.resolveTransitionOperationPartitionId(operation);
    return isPriorityControlPlanePartition({partitionId});
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
    const message = this.normalizeErrorMessage(errorLike, '');
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

}

export {OperationWorkflowOwnerSegment2};
