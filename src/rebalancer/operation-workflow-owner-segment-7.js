import { OPERATION_WORKFLOW_OWNER_SHARED } from "./operation-workflow-owner-shared.js";
import { OperationWorkflowOwnerSegment6 } from "./operation-workflow-owner-segment-6.js";

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

const STOPPING_REPLICA_OBSERVATION_STATE = Object.freeze({
  OBSERVED: "observed",
  ABSENT: "absent",
  UNAVAILABLE: "unavailable",
});

class OperationWorkflowOwnerSegment7 extends OperationWorkflowOwnerSegment6 {
  isObservedProgressOperationCandidate(operation) {
    if (
      !operation ||
      this.repository.isOperationTerminal(operation) ||
      !this.repository.isOperationLocallyOwned(operation)
    ) {
      return false;
    }

    if (OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS.has(operation.workflowStep)) {
      return true;
    }

    return (
      operation.type === OperationType.REPLACE &&
      operation.workflowStep === WORKFLOW_STEP.ACTIVE
    );
  }

  /**
   * @param {Object} serviceRow
   * @param {string} cacheOperation
   * @return {string[]}
   */
  findObservedProgressOperationIds(serviceRow, cacheOperation) {
    if (
      !serviceRow ||
      typeof serviceRow !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      return [];
    }

    if (cacheOperation !== OPERATION_WORKFLOW_OWNER_LITERAL.DELETE) {
      const status = String(serviceRow.status || "").toLowerCase();
      if (!OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES.has(status)) {
        return [];
      }
    }

    const targetNodeId = String(serviceRow.node_id || serviceRow.nodeId || "");
    const replicaId = String(
      serviceRow.service_id ||
        serviceRow.serviceId ||
        serviceRow.replica_id ||
        serviceRow.replicaId ||
        "",
    );
    const partitionId = String(
      serviceRow.partition_id || serviceRow.partitionId || "",
    );
    if (
      targetNodeId.length === NUM.ZERO ||
      (replicaId.length === NUM.ZERO && partitionId.length === NUM.ZERO)
    ) {
      return [];
    }

    const matchingRows =
      this.repository.filterReplicaOperationRowsFromCache((row) => {
        const operation = this.repository.rowToOperation(row);
        if (!this.isObservedProgressOperationCandidate(operation)) {
          return false;
        }
        if (operation.targetNodeId !== targetNodeId) {
          return false;
        }
        if (replicaId.length > NUM.ZERO && operation.replicaId === replicaId) {
          return true;
        }
        return (
          partitionId.length > NUM.ZERO && operation.partitionId === partitionId
        );
      }) || [];

    return [
      ...new Set(
        matchingRows
          .map((row) => row?.operation_id || row?.operationId || null)
          .filter(
            (opId) =>
              typeof opId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
              opId.length > NUM.ZERO,
          ),
      ),
    ];
  }

  /**
   * @param {string} operationId
   * @return {Promise<boolean>}
   */
  async reconcileObservedProgressOperation(operationId) {
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === NUM.ZERO
    ) {
      return false;
    }
    const visibilityObservation =
      await this.repository.getOperationByIdVisibilityObservation(
        operationId,
        {
          requireOwnerRpcRead: false,
          allowPriorityRecoveryDeferredVisibility: true,
        },
      );
    const operation = visibilityObservation?.operation || null;
    if (!this.isObservedProgressOperationCandidate(operation)) {
      this.clearObservedProgressRetry(operationId);
      return false;
    }
    const progressed = await this.reconcileOperationProgress(operation, {
      cause: "observed_progress",
    });
    this.clearObservedProgressRetry(operationId);
    return progressed;
  }

  /**
   * Observe services cache progress and re-enter the owner lane.
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Object} record
   */
  handleObservedReplicaStateChange(tableName, cacheOperation, record) {
    if (
      this.isShuttingDown ||
      !this.isInitialized ||
      tableName !== SYSTEM_TABLE_NAME.SERVICES
    ) {
      return;
    }

    const operationIds = this.findObservedProgressOperationIds(
      record,
      cacheOperation,
    );
    for (const operationId of operationIds) {
      this.operationWorkflowRunExclusive(
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
    }
  }

  // --- Reconciliation and timeout ---

  /**
   * Observe one source-removal replica state without collapsing authoritative
   * absence and authoritative visibility loss into the same outcome.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<Object>}
   * @private
   */
  async observeStoppingReplicaProgress(replicaId, partitionId, targetNodeId) {
    if (
      this.repository &&
      typeof this.repository.getActualReplicaObservation === TYPEOF.FUNCTION
    ) {
      const observation = await this.repository.getActualReplicaObservation(
        replicaId,
        partitionId,
        targetNodeId,
      );
      const observationState =
        observation?.state || STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE;
      return Object.freeze({
        state: observationState,
        lifecycleStatus:
          observationState === STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED ?
            observation.lifecycleStatus :
            null,
      });
    }
    const actualStatus = await this.getActualReplicaStatus(
      replicaId,
      partitionId,
      targetNodeId,
    );
    return Object.freeze({
      state:
        actualStatus === null ?
          STOPPING_REPLICA_OBSERVATION_STATE.ABSENT :
          STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
      lifecycleStatus: actualStatus,
    });
  }

  /**
   * Reconcile STOPPING remove/replace progression against source replica
   * removal state.
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileStoppingOperationProgress(operation) {
    const removingReplicaId =
      operation.type === OperationType.REPLACE
        ? this.repository.getReplaceSourceReplicaId(operation)
        : operation.replicaId;
    const removingNodeId =
      operation.type === OperationType.REPLACE
        ? operation.sourceNodeId
        : operation.targetNodeId;
    if (!removingReplicaId) {
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_MISSING_DURING_STOPPING_RECONCILIATION,
      );
      return true;
    }

    const stoppingReplicaObservation = await this.observeStoppingReplicaProgress(
      removingReplicaId,
      operation.partitionId,
      removingNodeId,
    );
    const actualStatus = stoppingReplicaObservation.lifecycleStatus;

    if (
      stoppingReplicaObservation.state ===
        STOPPING_REPLICA_OBSERVATION_STATE.ABSENT ||
      (operation.type === OperationType.REPLACE &&
        actualStatus === ReplicaStatus.FAILED)
    ) {
      await this.completeOperation(operation);
      return true;
    }

    if (
      stoppingReplicaObservation.state ===
      STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE
    ) {
      return false;
    }

    if (actualStatus === ReplicaStatus.FAILED) {
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_REMOVE_RECONCILIATION,
      );
      return true;
    }

    const replayResult =
      await this.executeOperationFromReconcilePath(operation);
    if (
      replayResult?.success === true &&
      replayResult.status !== ReplicaOperationResponseStatus.IN_PROGRESS
    ) {
      return true;
    }

    return false;
  }

  /**
   * Apply one reconciled target-replica status to the canonical operation
   * owner path.
   * @param {Object} operation
   * @param {string|null} actualStatus
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   * @private
   */
  async applyReconciledReplicaStatus(operation, actualStatus, options = {}) {
    const cause = options.cause || "progress";

    if (
      actualStatus === ReplicaStatus.CREATING &&
      (operation.workflowStep === WORKFLOW_STEP.PENDING ||
        operation.workflowStep === WORKFLOW_STEP.SENDING)
    ) {
      await this.updateStep(operation, WORKFLOW_STEP.CREATING);
      return true;
    }

    if (
      actualStatus === ReplicaStatus.SYNCING &&
      (operation.workflowStep === WORKFLOW_STEP.PENDING ||
        operation.workflowStep === WORKFLOW_STEP.SENDING ||
        operation.workflowStep === WORKFLOW_STEP.CREATING)
    ) {
      await this.updateStep(operation, WORKFLOW_STEP.SYNCING);
      return true;
    }

    if (actualStatus === ReplicaStatus.ACTIVE) {
      if (operation.type === OperationType.REPLACE) {
        await this.reconcileReplaceActualActive(operation);
      } else {
        await this.completeOperation(operation);
      }
      return true;
    }

    if (actualStatus === ReplicaStatus.FAILED) {
      await this.failOperation(
        operation,
        cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
          operation.workflowStep === WORKFLOW_STEP.SYNCING
          ? OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_SYNC
          : OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_OPERATION_RECONCILIATION,
      );
      return true;
    }

    if (
      actualStatus === null &&
      cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
      operation.workflowStep === WORKFLOW_STEP.SYNCING
    ) {
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_NOT_FOUND_DURING_RECOVERY_RECONCILIATION,
      );
      return true;
    }

    if (
      this.shouldRearmDispatchFromProgressReconcile(operation, actualStatus)
    ) {
      await this.executeOperationFromReconcilePath(operation);
      return true;
    }

    return false;
  }

  /**
   * Reconcile one in-flight operation through the canonical owner path.
   * Different wakeup causes share one progression implementation after the
   * owner queue is entered.
   * @param {Object} operation
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileOperationLifecycle(operation, options = {}) {
    if (!operation) {
      return false;
    }
    if (!this.repository.isOperationLocallyOwned(operation)) {
      return false;
    }

    const cause = options.cause || "progress";
    const lifecycleAction = this.resolveOperationLifecycleAction(
      operation,
      cause,
    );
    switch (lifecycleAction) {
      case OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY:
        await this.failOperation(
          operation,
          OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_OPERATION,
        );
        this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, {
          operationId: operation.operationId,
          workflowStep: operation.workflowStep,
          partitionId: operation.partitionId,
        });
        return true;
      case OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY:
        await this.failOperation(
          operation,
          OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_REMOVAL_OPERATION,
        );
        this.logger.info(
          REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_REMOVE_FAILED,
          {
            operationId: operation.operationId,
            workflowStep: operation.workflowStep,
            partitionId: operation.partitionId,
          },
        );
        return true;
      case OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE:
      case OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH:
        await this.executeOperationFromReconcilePath(operation);
        return true;
      case OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING:
        return this.reconcileStoppingOperationProgress(operation);
      case OPERATION_LIFECYCLE_ACTION.NOOP:
        return false;
      case OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS:
      default:
        break;
    }

    const actualStatus = await this.getReconciledReplicaStatus(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
    );
    if (cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY) {
      this.repository.emitReplicaStatusDivergence(
        operation.replicaId,
        actualStatus,
        SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
      );
    }
    return this.applyReconciledReplicaStatus(operation, actualStatus, {
      cause,
    });
  }

  /**
   * Reconcile one in-flight operation against observed replica state.
   * @param {Object} operation
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   */
  async reconcileOperationProgress(operation, options = {}) {
    return this.reconcileOperationLifecycle(operation, options);
  }

  /**
   * @param {string} step
   * @return {number}
   */
  getTimeoutForStep(step, operation = null) {
    switch (step) {
      case WORKFLOW_STEP.PENDING:
      case WORKFLOW_STEP.SENDING:
        return this.config.pendingTimeoutMs;
      case WORKFLOW_STEP.CREATING:
        return this.config.creatingTimeoutMs;
      case WORKFLOW_STEP.SYNCING: {
        const configuredTimeout = this.config.syncingTimeoutMs;
        const partitionId = operation?.partitionId || null;
        if (!isPriorityControlPlanePartition({ partitionId })) {
          return configuredTimeout;
        }
        return Math.max(
          TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
          Math.min(
            configuredTimeout,
            PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
          ),
        );
      }
      case WORKFLOW_STEP.STOPPING:
        return this.config.removingTimeoutMs;
      default:
        return this.config.pendingTimeoutMs;
    }
  }

  /**
   * Per-operation timeout/progress reconciliation.
   * Called after reconcileOperationProgress returns false.
   * @param {Object} operation
   * @param {number} now
   * @return {Promise<void>}
   */
  async reconcileTimeoutOperation(operation, now) {
    if (
      this.hasActiveTransitionRetryGrace(operation?.operationId || null, now)
    ) {
      return;
    }
    const progressed = await this.reconcileOperationProgress(operation, {
      cause: "timeout",
    });
    if (progressed) {
      return;
    }

    const operationBudget = createTopLevelOperationBudget({
      configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
      operationName: "rebalance",
      startedAtMs: operation.createdAt || operation.updatedAt,
      now: () => now,
    });

    const stepTimeout = this.getTimeoutForStep(
      operation.workflowStep,
      operation,
    );
    const stepAllocation = createChildTimeoutBudget(operationBudget, {
      requestedBudgetMs: stepTimeout,
      minimumBudgetMs: TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
      nestedOperation: `rebalance:${String(
        operation.workflowStep || "unknown",
      ).toLowerCase()}`,
      now: () => now,
    });

    const elapsed = now - operation.updatedAt;
    const stepExceeded = elapsed >= stepTimeout;
    const budgetExhausted = !stepAllocation.allowed;

    if (stepExceeded || budgetExhausted) {
      const timeoutClassification = budgetExhausted
        ? stepAllocation.timeoutClassification
        : buildTimeoutClassification({
            budget: operationBudget,
            classification:
              TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
            nestedOperation: `rebalance:${String(
              operation.workflowStep || "unknown",
            ).toLowerCase()}`,
            now: () => now,
          });

      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TIMED_OUT, {
        operationId: operation.operationId,
        workflowStep: operation.workflowStep,
        elapsed,
        timeout: stepTimeout,
        budgetExhausted,
        timeoutClassification,
      });

      await this.failOperation(
        operation,
        `Timeout in ${operation.workflowStep} step ` + `after ${elapsed}ms`,
        {
          stepMetadata: {
            timeoutClassification,
            timeoutMs: stepTimeout,
            elapsedMs: elapsed,
            timedOutAtMs: now,
            budgetExhausted,
          },
        },
      );

      this.stats.operationsTimedOut++;
    }
  }

  /**
   * Check for timed out operations.
   * @return {Promise<void>}
   */
  async checkTimeouts() {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const now = Date.now();
    if (
      this.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO &&
      now - this.lastEmptyIncompleteOperationQueryAtMs <
        this.incompleteOperationQueryEmptyBackoffMs
    ) {
      return;
    }

    const canUseCacheObservationBoundary =
      this.repository.hasReplicaOperationCacheObservationBoundary();
    const cachedIncompleteOps = canUseCacheObservationBoundary
      ? await this.repository.queryCachedIncompleteOperations()
      : [];
    if (cachedIncompleteOps.length > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
    } else if (
      canUseCacheObservationBoundary &&
      this.shouldDelayEmptyIncompleteOperationQuery(now)
    ) {
      return;
    }

    const incompleteOperationObservation =
      await this.repository.getIncompleteOperationVisibilityObservation({
        cachedOperations: cachedIncompleteOps,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
      });
    const incompleteOps = Array.isArray(
      incompleteOperationObservation?.operations,
    )
      ? incompleteOperationObservation.operations
      : [];
    if (
      incompleteOperationObservation.state ===
      INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY
    ) {
      this.lastEmptyIncompleteOperationQueryAtMs = now;
      return;
    }
    this.clearEmptyIncompleteOperationQueryDelay();
    if (
      incompleteOperationObservation.state ===
      INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    ) {
      return;
    }

    const timeoutReconcileTasks = [];

    for (const operation of incompleteOps) {
      if (!this.repository.isOperationLocallyOwned(operation)) {
        continue;
      }
      if (this.repository.isOperationTerminal(operation)) {
        continue;
      }

      const singleFlightKey = this.getOperationOwnerSingleFlightKey(
        operation.operationId,
      );

      const reconcileTask = this.operationWorkflowRunExclusive(
        singleFlightKey,
        async () => {
          const visibilityObservation =
            await this.repository.getOperationByIdVisibilityObservation(
              operation.operationId,
              {
                requireOwnerRpcRead: false,
                allowPriorityRecoveryDeferredVisibility: true,
              },
            );
          const timeoutOperation =
            visibilityObservation?.operation || operation;
          if (!this.repository.isOperationLocallyOwned(timeoutOperation)) {
            return;
          }
          if (this.repository.isOperationTerminal(timeoutOperation)) {
            return;
          }

          await this.reconcileTimeoutOperation(timeoutOperation, Date.now());
        },
      ).catch((error) => {
        if (
          this.deferTransitionRetry(operation.operationId, error, {
            boundary: "timeout_reconcile",
            workflowStep: operation?.workflowStep || null,
            partitionId: operation?.partitionId || null,
            updatedAt: operation?.updatedAt,
            createdAt: operation?.createdAt,
          })
        ) {
          return;
        }
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
          {
            operationId: operation.operationId,
            error: error.message,
            nodeId: this.nodeId,
          },
        );
      });
      timeoutReconcileTasks.push(reconcileTask);
    }

    if (timeoutReconcileTasks.length > NUM.ZERO) {
      await Promise.all(timeoutReconcileTasks);
    }

    // Periodic reservation reconciliation (Req 4.4)
    await this.reconcileReservations().catch((error) => {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
        { error: error.message },
      );
    });
  }

  // --- Executor outcome routing ---

  /**
   * Handle an executor outcome event.
   * @param {Object} outcome
   */
  handleExecutorOutcome(outcome) {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const operationId = outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    if (!operationId) {
      return;
    }

    const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);

    this.operationWorkflowRunExclusive(singleFlightKey, () =>
      this.reconcileExecutorOutcome(outcome),
    ).catch((error) => {
      if (
        this.deferTransitionRetry(operationId, error, {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
          workflowStep: outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP] || null,
          partitionId: null,
        })
      ) {
        return;
      }
      this.logger.error(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_TRANSITION_FAILED,
        {
          operationId,
          outcomeType: outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE],
          error: error.message,
        },
      );
    });
  }

  /**
   * Reconcile a single executor outcome.
   * @param {Object} outcome
   * @return {Promise<boolean>}
   */
  async reconcileExecutorOutcome(outcome) {
    const operationId = outcome[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    const outcomeType = outcome[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE];
    const workflowStep = outcome[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP];
    const errorMessage = outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE];

    this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_RECEIVED, {
      operationId,
      outcomeType,
      workflowStep,
    });

    const operation = await this.repository.queryOperationById(operationId);
    if (!operation) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_FOUND,
        { operationId, outcomeType },
      );
      return false;
    }

    if (this.repository.isOperationTerminal(operation)) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_TERMINAL,
        {
          operationId,
          outcomeType,
          step: operation.workflowStep,
        },
      );
      return false;
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_LOCAL,
        { operationId, outcomeType },
      );
      return false;
    }

    const mapping = EXECUTOR_OUTCOME_ACTION_MAP[outcomeType];
    if (!mapping) {
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION, {
        operationId,
        outcomeType,
      });
      return false;
    }

    const shouldResumeReplaceActivePhase =
      mapping.action === EXECUTOR_OUTCOME_ACTION.COMPLETE &&
      workflowStep === WORKFLOW_STEP.ACTIVE &&
      operation.type === OperationType.REPLACE;

    if (mapping.action === EXECUTOR_OUTCOME_ACTION.UPDATE_STEP) {
      await this.updateStep(
        operation,
        workflowStep,
        OPERATION_TRANSITION_REASON.EXECUTOR_OUTCOME,
      );
    } else if (shouldResumeReplaceActivePhase) {
      await this.reconcileReplaceActualActive(operation);
    } else if (mapping.action === EXECUTOR_OUTCOME_ACTION.COMPLETE) {
      await this.completeOperation(operation);
    } else if (mapping.action === EXECUTOR_OUTCOME_ACTION.FAIL) {
      await this.failOperation(operation, errorMessage || outcomeType);
    } else {
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION, {
        operationId,
        outcomeType,
        action: mapping.action,
      });
      return false;
    }

    this.emitter.emit(REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED, {
      operationId,
      outcomeType,
      action: mapping.action,
    });

    return true;
  }

  // --- Recovery ---

  /**
   * @param {string} step
   * @return {boolean}
   */
  isPreSyncStep(step) {
    return [
      WORKFLOW_STEP.PENDING,
      WORKFLOW_STEP.SENDING,
      WORKFLOW_STEP.CREATING,
    ].includes(step);
  }

  /**
   * Resolve the next legal lifecycle action for one locally owned operation.
   * Multiple wake causes can feed the owner, but they should all reduce to one
   * explicit action model.
   *
   * @param {Object} operation
   * @param {string} [cause='progress']
   * @return {string}
   * @private
   */
  resolveOperationLifecycleAction(
    operation,
    cause = OPERATION_WORKFLOW_OWNER_LITERAL.PROGRESS,
  ) {
    if (cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY) {
      if (this.isPreSyncStep(operation.workflowStep)) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY;
      }
      if (operation.workflowStep === WORKFLOW_STEP.STOPPING) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY;
      }
    }

    if (
      operation.type === OperationType.REPLACE &&
      operation.workflowStep === WORKFLOW_STEP.ACTIVE
    ) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE;
    }

    if (this.isRemoveInitialDispatchPhase(operation)) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH;
    }

    if (
      operation.workflowStep === WORKFLOW_STEP.STOPPING &&
      (operation.type === OperationType.REMOVE ||
        operation.type === OperationType.REPLACE)
    ) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING;
    }

    if (
      operation.workflowStep === WORKFLOW_STEP.PENDING ||
      operation.workflowStep === WORKFLOW_STEP.SENDING ||
      operation.workflowStep === WORKFLOW_STEP.CREATING ||
      operation.workflowStep === WORKFLOW_STEP.SYNCING
    ) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS;
    }

    return OPERATION_LIFECYCLE_ACTION.NOOP;
  }

  /**
   * Per-operation recovery logic.
   * @param {Object} op
   * @return {Promise<void>}
   */
  async reconcileRecoveryOperation(op) {
    await this.reconcileOperationLifecycle(op, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
    });
  }

  /**
   * Reconcile a SYNCING operation by checking actual replica status.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async reconcileSyncingOperation(operation) {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_SYNCING, {
      operationId: operation.operationId,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    const progressed = await this.reconcileOperationLifecycle(operation, {
      cause: "recovery",
    });
    if (!progressed) {
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_IN_PROGRESS, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        workflowStep: operation.workflowStep,
      });
    }
  }

  /**
   * Handle node recovery.
   * @return {Promise<Object>}
   */
  async handleRecovery() {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START, {
      nodeId: this.nodeId,
    });

    const result = {
      totalIncomplete: NUM.ZERO,
      markedFailed: NUM.ZERO,
      reconciled: NUM.ZERO,
      errors: [],
    };

    const canUseCacheObservationBoundary =
      this.repository.hasReplicaOperationCacheObservationBoundary();
    const cachedIncompleteOps = canUseCacheObservationBoundary ?
      await this.repository.queryCachedIncompleteOperations() :
      [];
    const incompleteOperationObservation =
      await this.repository.getIncompleteOperationVisibilityObservation({
        cachedOperations: cachedIncompleteOps,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE
            .CACHE_PREFERRED_SQL_FALLBACK,
      });
    const incompleteOps = Array.isArray(
      incompleteOperationObservation?.operations,
    ) ?
      incompleteOperationObservation.operations :
      [];
    result.totalIncomplete = incompleteOps.length;
    result.incompleteOperationObservationState =
      incompleteOperationObservation.state;
    result.incompleteOperationRetryAfterMs =
      incompleteOperationObservation.retryAfterMs;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND, {
      count: incompleteOps.length,
      incompleteOperationObservationState:
        incompleteOperationObservation.state,
      incompleteOperationRetryAfterMs:
        incompleteOperationObservation.retryAfterMs,
      nodeId: this.nodeId,
    });

    for (const op of incompleteOps) {
      if (!this.repository.isOperationLocallyOwned(op)) {
        continue;
      }

      const originalStep = op.workflowStep;

      const singleFlightKey = this.getOperationOwnerSingleFlightKey(
        op.operationId,
      );

      try {
        await this.operationWorkflowRunExclusive(
          singleFlightKey,
          () => this.reconcileRecoveryOperation(op),
        );
      } catch (error) {
        if (this.deferTransitionRetry(op.operationId, error, {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
          workflowStep: op?.workflowStep || null,
          partitionId: op?.partitionId || null,
          updatedAt: op?.updatedAt,
          createdAt: op?.createdAt,
        })) {
          continue;
        }
        result.errors.push({
          operationId: op.operationId,
          error: error.message,
        });
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED,
          {
            operationId: op.operationId,
            workflowStep: originalStep,
            partitionId: op.partitionId,
            error: error.message,
          },
        );
        continue;
      }

      if (
        this.isPreSyncStep(originalStep) ||
        originalStep === WORKFLOW_STEP.STOPPING
      ) {
        result.markedFailed++;
      } else if (originalStep === WORKFLOW_STEP.SYNCING) {
        result.reconciled++;
      }
    }

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED, {
      nodeId: this.nodeId,
      ...result,
    });

    const reservationResult = await this.reconcileReservations();
    result.reservationsExpired = reservationResult.expired;
    result.reservationsOrphansReleased =
      reservationResult.orphansReleased;

    this.emitter.emit(
      REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED,
      result,
    );

    return result;
  }

  // --- Helpers ---

  /**
   * @param {string} errorMessage
   * @return {boolean}
   */
  isSafetyPolicyFailure(errorMessage) {
    if (
      typeof errorMessage !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      !errorMessage
    ) {
      return false;
    }
    const normalized = errorMessage.toLowerCase();
    return (
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL
          .WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY_PROJECTION_MEMBERSHIP,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL
          .IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR
          .trim(),
      )
    );
  }

  /**
   * @param {Object} operation
   * @param {boolean} replaceRemovePhase
   * @param {string} removeSafetyError
   * @return {boolean}
   */
  async getRemoveSafetyDeferReason(
    operation,
    replaceRemovePhase,
    removeSafetyError,
  ) {
    if (!operation || !this.isSafetyPolicyFailure(removeSafetyError)) {
      return null;
    }
    if (operation.type === OperationType.REPLACE && replaceRemovePhase) {
      return REBALANCE_COORDINATOR_DEFER_REASON
        .REPLACE_REMOVE_SAFETY_BLOCKED;
    }
    if (
      operation.type !== OperationType.REMOVE ||
      !await this.isCriticalRemoveOverReplicated(operation)
    ) {
      return null;
    }
    return REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED;
  }

  /**
   * @param {Object} operation
   * @return {Promise<boolean>}
   */
  async isCriticalRemoveOverReplicated(operation) {
    if (
      !operation ||
      operation.type !== OperationType.REMOVE ||
      !this.isCriticalSystemPartition(operation.partitionId)
    ) {
      return false;
    }
    const criticalReplicaRows = await this.getCriticalReplicaRowsForSafety(
      operation.partitionId,
    );
    const minReplicaCount = await this.getCriticalMinReplicaCount(
      operation.partitionId,
    );
    return criticalReplicaRows.length > minReplicaCount;
  }

  /**
   * @param {string|null|undefined} operationId
   * @return {void}
   */
  clearDeferredSafetyBlockState(operationId) {
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === NUM.ZERO
    ) {
      return;
    }
    this.clearSafetyDeferredRetry(operationId);
    this.safetyDeferredLogStateByOperationId.delete(operationId);
  }

  /**
   * @param {Object} operation
   * @param {string} errorMessage
   * @return {void}
   */
  logDeferredSafetyBlockedRemove(
    operation,
    errorMessage,
    deferReason,
  ) {
    const operationId = operation?.operationId;
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === NUM.ZERO
    ) {
      return;
    }
    const now = Date.now();
    const previousState =
      this.safetyDeferredLogStateByOperationId.get(operationId) || null;
    const errorChanged = previousState?.errorMessage !== errorMessage;
    const throttleElapsed = !previousState ||
      now - previousState.loggedAtMs >=
        SAFETY_DEFERRED_LOG_THROTTLE_MS;

    this.safetyDeferredLogStateByOperationId.set(operationId, {
      errorMessage,
      loggedAtMs: now,
    });

    if (!errorChanged && !throttleElapsed) {
      return;
    }

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DEFERRED_BY_SAFETY_POLICY,
      {
        operationId,
        partitionId: operation.partitionId,
        sourceNodeId: operation.sourceNodeId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        reason: deferReason,
        errorMessage,
      },
    );
  }

  /**
   * @param {*} errorLike
   * @param {string} fallbackMessage
   * @return {string}
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    if (
      typeof errorLike === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      errorLike.trim()
    ) {
      return errorLike;
    }

    if (
      !errorLike ||
      typeof errorLike !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      return fallbackMessage;
    }

    const candidateValues = [
      errorLike.message,
      errorLike.errorMessage,
      errorLike.error?.message,
      errorLike.error?.errorMessage,
      errorLike.details?.message,
      errorLike.details?.errorMessage,
    ];

    for (const candidate of candidateValues) {
      if (
        typeof candidate === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        candidate.trim()
      ) {
        return candidate;
      }
    }

    return fallbackMessage;
  }
}

export { OperationWorkflowOwnerSegment7 };
