import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerRetryRegistry} from './operation-workflow-owner-retry-registry.js';
import {withOwnerHandoffState} from './operation-workflow-owner-handoff-state.js';
import {
  REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
} from './replica-operation-repository.js';
import {
  TERMINAL_TRANSITION_REPAIR_CAUSE,
  armTerminalTransitionRepair,
  clearTerminalTransitionRepair,
} from './operation-workflow-terminal-transition-repair.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_OWNER_ACTION,
  OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR,
  OPERATION_SINGLE_FLIGHT_SCOPE,
  OPERATION_TRANSITION_REASON,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_SKIP_REASON,
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

class OperationWorkflowOwnerExecutionLane
  extends withOwnerHandoffState(OperationWorkflowOwnerRetryRegistry) {
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
      Number.isFinite(retryAfterMs) && retryAfterMs > 0 ?
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
      typeof this.repository.getActualReplicaObservation === 'function'
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
      typeof this.repository.getActualReplicaObservation === 'function'
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
    if (this.incompleteOperationQueryEmptyBackoffMs <= 0) {
      return false;
    }
    if (this.lastEmptyIncompleteOperationQueryAtMs <= 0) {
      this.lastEmptyIncompleteOperationQueryAtMs = now;
      return true;
    }
    if (
      now - this.lastEmptyIncompleteOperationQueryAtMs <
      this.incompleteOperationQueryEmptyBackoffMs
    ) {
      return true;
    }
    this.lastEmptyIncompleteOperationQueryAtMs = 0;
    return false;
  }

  /**
   * Clear bounded empty-owner scan deferral once local work is observed.
   * @return {void}
   */
  clearEmptyIncompleteOperationQueryDelay() {
    this.lastEmptyIncompleteOperationQueryAtMs = 0;
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
   * Build the independent autocommit persistence intent for a transition.
   * SQL still promotes a post-mirror multi-participant plan to a statement-
   * owned distributed transaction after it knows the final participant set.
   * @return {Object}
   * @private
   */
  buildOperationTransitionPersistOptions() {
    return {
      confirmPersistence: false,
      disableSystemWriteSession: true,
    };
  }

  /**
   * Confirm one committed transition so post-commit visibility lag cannot
   * unwind a transition that already durably committed. Confirmation never
   * throws to the caller; for TERMINAL transitions an unconfirmed outcome
   * (thrown or deferred) arms the terminal-transition repair instead of being
   * dropped — a terminal projection the ledger never reflects is an immortal
   * non-terminal row that no level-triggered path re-drives (run-21 ghost).
   * @param {Object} operation
   * @param {Object} [options]
   * @param {boolean} [options.terminalTransitionRepair] - Arm repair when the
   *   confirmation does not positively confirm visibility.
   * @return {Promise<void>}
   */
  async confirmCommittedTransitionPersistence(operation, options = {}) {
    const repairOnUnconfirmed = options.terminalTransitionRepair === true;
    let visibility = null;
    try {
      visibility =
        await this.repository.confirmReplicaOperationPersistence(operation);
    } catch (error) {
      this.warnCommittedTransitionNotVisible(operation, error);
      if (repairOnUnconfirmed) {
        armTerminalTransitionRepair(
          this,
          operation,
          TERMINAL_TRANSITION_REPAIR_CAUSE.CONFIRMATION_FAILED,
        );
      }
      return;
    }
    if (!repairOnUnconfirmed) {
      return;
    }
    this.resolveTerminalTransitionConfirmationOutcome(operation, visibility);
  }

  /**
   * @param {Object} operation
   * @param {Error} error
   * @return {void}
   * @private
   */
  warnCommittedTransitionNotVisible(operation, error) {
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

  /**
   * A positively confirmed terminal transition clears any armed repair; every
   * other outcome (DEFERRED — the silent class) arms it.
   * @param {Object} operation
   * @param {Object|null} visibility
   * @return {void}
   * @private
   */
  resolveTerminalTransitionConfirmationOutcome(operation, visibility) {
    if (
      visibility?.confirmationState ===
        REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED &&
      visibility?.operation
    ) {
      clearTerminalTransitionRepair(this, operation?.operationId || null);
      return;
    }
    armTerminalTransitionRepair(
      this,
      operation,
      TERMINAL_TRANSITION_REPAIR_CAUSE.CONFIRMATION_DEFERRED,
    );
  }
}

export {OperationWorkflowOwnerExecutionLane};
