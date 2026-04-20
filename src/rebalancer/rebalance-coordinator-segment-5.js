import { REBALANCE_COORDINATOR_SHARED } from "./rebalance-coordinator-shared.js";
import { RebalanceCoordinatorSegment4 } from "./rebalance-coordinator-segment-4.js";

const {
  CONCURRENT_CREATE_BUDGET_SCOPE,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_QUERY_OPTIONS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WORKLOAD_CLASS,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  ConfigurationManager,
  ControlPlaneReadinessService,
  DEFAULT_AMPLIFICATION_FACTOR,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DurableWorkflowCoordinator,
  EventEmitter,
  ExecutorOutcomeEmitter,
  INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  LoggingService,
  NUM,
  OPERATION_METADATA_KEY,
  OUTCOME_EVENT_NAME,
  OperationLane,
  OperationType,
  OperationWorkflowOwner,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PRIORITY_RECENT_INTENT_TTL_MS,
  PressureGovernor,
  ProvisioningAdmissionPolicy,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECENT_INTENT_TTL_MS,
  RECENT_OPERATION_INTENT_VISIBILITY_STATE,
  REPLICA_ID_SEPARATOR,
  REPLICA_ID_START_INDEX,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  RESERVATION_REASON,
  RESERVATION_STATUS,
  ReplicaOperationField,
  ReplicaOperationRepository,
  SERVICE_TYPE,
  SQL,
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  STORAGE_RESERVATION_READ_QUERY_OPTIONS,
  STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
  SYSTEM_TABLE_NAME,
  StartupRecoveryCoordinator,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TIME_MS,
  TOPOLOGY_GUARD_DEFAULT_PARTITION_TARGET_REPLICA_COUNT,
  TOPOLOGY_GUARD_ERROR_MSG,
  TOPOLOGY_GUARD_REASON,
  TOPOLOGY_GUARD_STATE,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  assertCritical,
  buildControlPlaneQueryOptions,
  buildControlPlaneWorkloadProfile,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildReplicatedServiceBootstrapTopology,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createControlPlaneRuntimeBundle,
  createOperationRecord,
  createTopLevelOperationBudget,
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isCriticalTransportControlPlanePartitionTable,
  isPriorityControlPlanePartitionTable,
  isRetryableControlPlaneError,
  readAuthoritativeControlPlaneRows,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
  uuidv4,
} = REBALANCE_COORDINATOR_SHARED;

class RebalanceCoordinatorSegment5 extends RebalanceCoordinatorSegment4 {
  async checkTimeouts() {
    if (!this.workflowOwner) {
      return;
    }
    return this.workflowOwner.checkTimeouts();
  }

  /**
   * @param {string} step
   * @return {number}
   * @private
   */
  getTimeoutForStep(step, operation = null) {
    return this.workflowOwner.getTimeoutForStep(step, operation);
  }

  /**
   * @param {Object} operation
   * @param {number} now
   * @return {Promise<void>}
   */
  async reconcileTimeoutOperation(operation, now) {
    return this.workflowOwner.reconcileTimeoutOperation(operation, now);
  }

  /**
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileOperationProgress(operation) {
    return this.workflowOwner.reconcileOperationProgress(operation);
  }

  /**
   * Handle an executor outcome event by routing it through the
   * owner-key reconcile queue. This is the only entry point for
   * executor outcomes into the coordinator — no direct mutation.
   *
   * The outcome is enqueued via `runExclusive` keyed by operationId
   * so that at most one reconcile runs per operation at a time.
   *
   * @param {Object} outcome - Frozen executor outcome payload.
   */
  handleExecutorOutcome(outcome) {
    return this.workflowOwner.handleExecutorOutcome(outcome);
  }

  /**
   * Reconcile a single executor outcome.
   * Delegates to workflow owner (D7.1).
   * @param {Object} outcome
   * @return {Promise<boolean>}
   */
  async reconcileExecutorOutcome(outcome) {
    return this.workflowOwner.reconcileExecutorOutcome(outcome);
  }

  /**
   * Handle node recovery - process incomplete operations.
   * Requirements: 7.1, 7.2, 7.3
   * @readModel COORDINATOR_RECOVERY_QUERY — READ_MODEL_SOURCE.RECOVERY_SQL
   *
   * This method is called when a node restarts to handle operations that
   * were in progress when the node went down.
   *
   * @return {Promise<Object>} Recovery result with counts.
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
    const cachedIncompleteOps = canUseCacheObservationBoundary
      ? await this.queryCachedIncompleteOperations()
      : [];
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
    result.totalIncomplete = incompleteOps.length;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND, {
      count: incompleteOps.length,
      nodeId: this.nodeId,
    });

    for (const op of incompleteOps) {
      if (!this.isOperationLocallyOwned(op)) {
        continue;
      }

      const originalStep = op.workflowStep;
      const singleFlightKey = this.getOperationOwnerSingleFlightKey(
        op.operationId,
      );

      try {
        await this.operationWorkflowRunExclusive(singleFlightKey, () =>
          this.reconcileRecoveryOperation(op),
        );
      } catch (error) {
        result.errors.push({
          operationId: op.operationId,
          error: error.message,
        });
        this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, {
          operationId: op.operationId,
          workflowStep: originalStep,
          partitionId: op.partitionId,
          error: error.message,
        });
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
    result.reservationsOrphansReleased = reservationResult.orphansReleased;

    this.emit(REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED, result);

    return result;
  }

  /**
   * @param {string} step
   * @return {boolean}
   * @private
   */
  isPreSyncStep(step) {
    return this.workflowOwner.isPreSyncStep(step);
  }

  /**
   * @param {Object} op
   * @return {Promise<void>}
   */
  async reconcileRecoveryOperation(op) {
    return this.workflowOwner.reconcileRecoveryOperation(op);
  }

  /**
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async reconcileSyncingOperation(operation) {
    return this.workflowOwner.reconcileSyncingOperation(operation);
  }

  /**
   * Resolve observed replica status from the local services cache boundary.
   * This is only used after authoritative service reads miss, so owner-path
   * progression can converge on exact observed target rows instead of timing
   * out behind stale visibility.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {string|null}
   * @private
   */
  getObservedReplicaStatusFromCache(replicaId, partitionId, targetNodeId) {
    return this.repository.getObservedReplicaStatusFromCache(
      replicaId,
      partitionId,
      targetNodeId,
    );
  }

  /**
   * Get actual replica status via SQL engine.
   * Per system guidelines: all system information access via SQL engine.
   * Requirements: 7.3
   * @readModel COORDINATOR_REPLICA_STATUS_RECONCILE —
   *   READ_MODEL_SOURCE.RECOVERY_SQL
   *
   * @param {string} replicaId - Replica ID.
   * @param {string} partitionId - Partition ID.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<string|null>} Replica status or null if not found.
   * @private
   */
  async getActualReplicaStatus(replicaId, partitionId, targetNodeId) {
    return this.repository.getActualReplicaStatus(
      replicaId,
      partitionId,
      targetNodeId,
    );
  }

  /**
   * Emit a typed divergence event when cache and authoritative replica
   * status differ during recovery reconciliation.
   * @param {string} replicaId - Replica service ID.
   * @param {string|null} authoritativeStatus - Status from SQL.
   * @param {string} reason - SQL_RECONCILIATION_REASON value.
   * @private
   */
  emitReplicaStatusDivergence(replicaId, authoritativeStatus, reason) {
    return this.repository.emitReplicaStatusDivergence(
      replicaId,
      authoritativeStatus,
      reason,
    );
  }

  /**
   * Get an operation by ID via SQL engine.
   *
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation or null if not found.
   */
  async getOperation(operationId) {
    return this.queryOperationById(operationId);
  }

  /**
   * Get all operations via SQL engine.
   * Note: This queries the database, not an in-memory cache.
   *
   * @return {Promise<Array<Object>>} Array of all operations.
   */
  async getAllOperations() {
    return this.repository.getAllOperations();
  }

  /**
   * Get operations by partition ID via SQL engine.
   *
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Array<Object>>} Array of operations for the partition.
   */
  async getOperationsByPartition(partitionId) {
    return this.getOperationsByEntity(SERVICE_TYPE.PARTITION, partitionId);
  }

  /**
   * Get operations by canonical entity identity via SQL engine.
   *
   * @param {string} entityType - Entity type.
   * @param {string} entityId - Entity ID.
   * @return {Promise<Array<Object>>} Array of operations for the entity.
   */
  async getOperationsByEntity(entityType, entityId, options = {}) {
    if (
      options?.visibilityReadMode ===
        REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED &&
      typeof this.repository?.getOperationsByEntityAuthoritative === "function"
    ) {
      return this.repository.getOperationsByEntityAuthoritative(
        entityType,
        entityId,
      );
    }
    return this.repository.getOperationsByEntity(entityType, entityId);
  }

  /**
   * Get in-flight operations (not completed or failed) via SQL engine.
   *
   * @return {Promise<Array<Object>>} Array of in-flight operations.
   */
  async getInFlightOperations() {
    return this.queryIncompleteOperations();
  }

  /**
   * Get count of concurrent ADD operations via SQL engine.
   *
   * @return {Promise<number>} Count of concurrent ADD operations.
   */
  async getConcurrentAddCount(options = {}) {
    const inFlight = await this.queryIncompleteOperations(options);
    return (await this.filterConcurrentAddBudgetOperations(inFlight)).length;
  }

  /**
   * Build add/replace in-flight counts for ordinary-priority,
   * emergency-priority, and non-priority lanes.
   * @param {Array<Object>} operations
   * @return {{
   *   priorityCount:number,
   *   ordinaryPriorityCount:number,
   *   emergencyPriorityCount:number,
   *   nonPriorityCount:number,
   * }}
   * @private
   */
  buildConcurrentAddCountByPriorityClass(operations = []) {
    let ordinaryPriorityCount = NUM.ZERO;
    let emergencyPriorityCount = NUM.ZERO;
    let nonPriorityCount = NUM.ZERO;
    for (const operation of operations) {
      if (!this.isConcurrentAddBudgetOperation(operation)) {
        continue;
      }
      const partitionId = String(
        operation.partitionId || operation.entityId || "",
      ).trim();
      if (
        partitionId.length > NUM.ZERO &&
        this.isPriorityControlPlanePartition(partitionId)
      ) {
        if (this.isEmergencyPriorityControlPlanePartition(partitionId)) {
          emergencyPriorityCount += NUM.ONE;
        } else {
          ordinaryPriorityCount += NUM.ONE;
        }
        continue;
      }
      nonPriorityCount += NUM.ONE;
    }
    return {
      priorityCount: ordinaryPriorityCount + emergencyPriorityCount,
      ordinaryPriorityCount,
      emergencyPriorityCount,
      nonPriorityCount,
    };
  }

  /**
   * Keep add-budget accounting aligned with the shared priority-recovery
   * planning contract. Priority control-plane rows that already satisfy
   * spread, or no longer target the current eligible cohort, must stop
   * consuming add-like budget capacity even before their source-removal phase
   * fully reconciles.
   *
   * @param {Array<Object>} operations
   * @return {Promise<Array<Object>>}
   * @private
   */
  async filterConcurrentAddBudgetOperations(operations = []) {
    const filteredOperations = [];
    const priorityOperationsByPartitionId = new Map();
    for (const operation of Array.isArray(operations) ? operations : []) {
      if (!this.isConcurrentAddBudgetOperation(operation)) {
        continue;
      }
      const partitionId = String(
        operation.partitionId || operation.entityId || "",
      ).trim();
      if (
        partitionId.length > NUM.ZERO &&
        this.isPriorityControlPlanePartition(partitionId)
      ) {
        if (!priorityOperationsByPartitionId.has(partitionId)) {
          priorityOperationsByPartitionId.set(partitionId, []);
        }
        priorityOperationsByPartitionId.get(partitionId).push(operation);
        continue;
      }
      if (await this.shouldIgnoreCriticalAddBudgetOperation(operation)) {
        continue;
      }
      filteredOperations.push(operation);
    }
    for (const [
      partitionId,
      partitionOperations,
    ] of priorityOperationsByPartitionId.entries()) {
      const partitionAssessment =
        await this.buildPriorityPartitionAddBudgetAssessment(
          partitionId,
          partitionOperations,
        );
      if (
        partitionAssessment &&
        !shouldPriorityRecoveryOperationBlockPlanning(partitionAssessment)
      ) {
        continue;
      }
      if (partitionAssessment) {
        filteredOperations.push(...partitionOperations);
        continue;
      }
      for (const operation of partitionOperations) {
        if (await this.shouldIgnoreCriticalAddBudgetOperation(operation)) {
          continue;
        }
        filteredOperations.push(operation);
      }
    }
    return filteredOperations;
  }

  /**
   * Resolve one canonical add-budget assessment for a priority partition.
   *
   * Add-budget ownership is a partition-level question during recovery. When
   * one priority partition fans out across multiple concurrent REPLACE
   * workflows, evaluating each row in isolation can keep the lane artificially
   * occupied even though the partition is already spread-satisfied in flight.
   *
   * @param {string} partitionId
   * @param {Array<Object>} operations
   * @return {Promise<Object|null>}
   * @private
   */
  async buildPriorityPartitionAddBudgetAssessment(
    partitionId,
    operations = [],
  ) {
    if (
      typeof this.workflowOwner
        ?.getPriorityRecoveryPlanningSnapshotForOperation !== "function"
    ) {
      return null;
    }
    const normalizedPartitionId = String(partitionId || "").trim();
    if (normalizedPartitionId.length === NUM.ZERO) {
      return null;
    }
    const partitionOperations = Array.isArray(operations)
      ? operations.filter((operation) => {
          const operationPartitionId = String(
            operation?.partitionId || operation?.entityId || "",
          ).trim();
          return operationPartitionId === normalizedPartitionId;
        })
      : [];
    if (partitionOperations.length === NUM.ZERO) {
      return null;
    }
    const representativeOperation = partitionOperations.find(Boolean) || null;
    if (!representativeOperation) {
      return null;
    }
    const planningSnapshot =
      await this.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation(
        representativeOperation,
      );
    if (!planningSnapshot || typeof planningSnapshot !== "object") {
      return null;
    }
    const effectiveEligibleNodeIds =
      resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds;
    const operationContexts = partitionOperations
      .map((operation) =>
        buildPriorityRecoveryOperationContextFromRecord(operation),
      )
      .filter(Boolean);
    return buildPriorityRecoveryPartitionAssessment({
      partitionId: normalizedPartitionId,
      priorityPartitionSummary:
        planningSnapshot.priorityPartitionSummary || null,
      admission: {
        effectiveEligibleNodeIds,
        effectiveEligibleNodeCount: effectiveEligibleNodeIds.length,
        ineligibleNodes: [],
      },
      operationContexts,
    });
  }

  /**
   * Resolve add/replace in-flight counts grouped by priority lane.
   * @param {Object} [options={}]
   * @return {Promise<{priorityCount:number, nonPriorityCount:number}>}
   * @private
   */
  async getConcurrentAddCountByPriorityClass(options = {}) {
    const inFlight = await this.queryIncompleteOperations(options);
    return this.buildConcurrentAddCountByPriorityClass(
      await this.filterConcurrentAddBudgetOperations(inFlight),
    );
  }

  /**
   * Return true when one operation still consumes add-budget capacity.
   * REPLACE operations in source-removal dispatch (ACTIVE/STOPPING) are
   * remove-phase work and must not block new add/replace scheduling.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isConcurrentAddBudgetOperation(operation) {
    if (!operation || typeof operation !== "object") {
      return false;
    }
    const type = String(operation.type || "").toUpperCase();
    if (type === OperationType.ADD) {
      return true;
    }
    if (type !== OperationType.REPLACE) {
      return false;
    }
    return !this.isReplaceRemoveDispatchPhase(operation);
  }

  /**
   * Get count of concurrent REMOVE operations via SQL engine.
   *
   * @return {Promise<number>} Count of concurrent REMOVE operations.
   */
  async getConcurrentRemoveCount(options = {}) {
    const inFlight = await this.queryIncompleteOperations(options);
    return inFlight.filter(
      (operation) => operation?.type === OperationType.REMOVE,
    ).length;
  }

  /**
   * Execute a replica_operations read with a local authoritative fast-path
   * when this node hosts the local leader replica for that system partition.
   * Falls back to the routed SQL engine otherwise.
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<Object>}
   * @private
   */
  async executeReplicaOperationsRead(sql, params = []) {
    return this.repository.executeReplicaOperationsRead(sql, params);
  }

  /**
   * Check if we can start a new ADD operation.
   *
   * @param {Object} [options={}]
   * @param {string} [options.concurrentBudgetReadMode]
   * @return {Promise<boolean>} True if we can start a new ADD operation.
   */
  async canStartAddOperation(options = {}) {
    if (this.shouldPauseAdmissionReadForLocalRouterPressure(options)) {
      return false;
    }
    const concurrentAddLimit = this.getConcurrentAddBudgetLimit(options);
    if (concurrentAddLimit <= NUM.ZERO) {
      return false;
    }
    const cachedIncompleteOperations =
      await this.queryCachedIncompleteOperations();
    const cachedOperationCount = Array.isArray(cachedIncompleteOperations)
      ? cachedIncompleteOperations.length
      : NUM.ZERO;
    const cachedCount = (
      await this.filterConcurrentAddBudgetOperations(cachedIncompleteOperations)
    ).length;
    if (cachedOperationCount > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
    }
    if (cachedCount > NUM.ZERO) {
      if (cachedCount < concurrentAddLimit) {
        return true;
      }
      if (
        options?.concurrentBudgetReadMode !==
        REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
      ) {
        return false;
      }
      const authoritativeCount = await this.getConcurrentAddCount({
        partitionId: options.partitionId,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      const authoritativeObservation = this.getIncompleteOperationObservation();
      this.reconcileIncompleteOperationEmptyQueryDelay(
        authoritativeObservation,
      );
      if (
        this.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
          authoritativeObservation,
        )
      ) {
        return false;
      }
      return authoritativeCount < concurrentAddLimit;
    }
    const bypassEmptyQueryDelay =
      options?.bypassEmptyQueryDelay === true ||
      cachedOperationCount > NUM.ZERO;
    if (
      !bypassEmptyQueryDelay &&
      this.shouldDelayEmptyIncompleteOperationQuery()
    ) {
      return false;
    }
    const count = await this.getConcurrentAddCount({
      partitionId: options.partitionId,
    });
    const incompleteOperationObservation =
      this.getIncompleteOperationObservation();
    this.reconcileIncompleteOperationEmptyQueryDelay(
      incompleteOperationObservation,
    );
    if (
      this.shouldAllowEmergencyPriorityDeferredObservation(
        options.partitionId,
        incompleteOperationObservation,
      )
    ) {
      return count < concurrentAddLimit;
    }
    if (
      this.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
        incompleteOperationObservation,
      )
    ) {
      return false;
    }
    return count < concurrentAddLimit;
  }

  /**
   * Check whether one priority add/replace can start.
   * Priority partitions use a dedicated count lane so unrelated non-priority
   * workflows cannot exhaust the spread-recovery scheduling budget.
   *
   * @param {Object} [options={}]
   * @param {string} [options.concurrentBudgetReadMode]
   * @return {Promise<boolean>}
   */
  async canStartPriorityAddOperation(options = {}) {
    if (this.shouldPauseAdmissionReadForLocalRouterPressure(options)) {
      return false;
    }
    const priorityRecoveryAdmissionPlan =
      this.getPriorityRecoveryAdmissionPlan();
    const maximumPriorityConcurrentAddLimit =
      priorityRecoveryAdmissionPlan.emergencyPriorityAddBudgetLimit;
    if (maximumPriorityConcurrentAddLimit <= NUM.ZERO) {
      return false;
    }
    const isPriorityCountsAdmitted = (counts = {}) => {
      return (
        priorityRecoveryAdmissionPlan.evaluatePriorityAddAdmission(
          options.partitionId,
          counts,
        ).allowed === true
      );
    };
    const cachedIncompleteOperations =
      await this.queryCachedIncompleteOperations();
    const cachedOperationCount = Array.isArray(cachedIncompleteOperations)
      ? cachedIncompleteOperations.length
      : NUM.ZERO;
    const cachedCounts = this.buildConcurrentAddCountByPriorityClass(
      await this.filterConcurrentAddBudgetOperations(
        cachedIncompleteOperations,
      ),
    );
    const cachedTotalCount =
      cachedCounts.priorityCount + cachedCounts.nonPriorityCount;
    if (cachedOperationCount > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
    }
    if (cachedTotalCount > NUM.ZERO) {
      if (isPriorityCountsAdmitted(cachedCounts)) {
        return true;
      }
      if (
        options?.concurrentBudgetReadMode !==
        REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
      ) {
        return false;
      }
      const authoritativeCounts =
        await this.getConcurrentAddCountByPriorityClass({
          partitionId: options.partitionId,
          visibilityReadMode:
            REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
        });
      const authoritativeObservation = this.getIncompleteOperationObservation();
      this.reconcileIncompleteOperationEmptyQueryDelay(
        authoritativeObservation,
      );
      if (
        this.shouldAllowEmergencyPriorityDeferredObservation(
          options.partitionId,
          authoritativeObservation,
        )
      ) {
        return isPriorityCountsAdmitted(authoritativeCounts);
      }
      if (
        this.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
          authoritativeObservation,
        )
      ) {
        return false;
      }
      return isPriorityCountsAdmitted(authoritativeCounts);
    }
    const bypassEmptyQueryDelay =
      options?.bypassEmptyQueryDelay === true ||
      cachedOperationCount > NUM.ZERO;
    if (
      !bypassEmptyQueryDelay &&
      this.shouldDelayEmptyIncompleteOperationQuery()
    ) {
      return false;
    }
    const counts = await this.getConcurrentAddCountByPriorityClass({
      partitionId: options.partitionId,
    });
    const incompleteOperationObservation =
      this.getIncompleteOperationObservation();
    this.reconcileIncompleteOperationEmptyQueryDelay(
      incompleteOperationObservation,
    );
    if (
      this.shouldAllowEmergencyPriorityDeferredObservation(
        options.partitionId,
        incompleteOperationObservation,
      )
    ) {
      return isPriorityCountsAdmitted(counts);
    }
    if (
      this.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
        incompleteOperationObservation,
      )
    ) {
      return false;
    }
    return isPriorityCountsAdmitted(counts);
  }

  /**
   * Check if we can start a new REMOVE operation.
   *
   * @param {Object} [options={}]
   * @param {string} [options.concurrentBudgetReadMode]
   * @return {Promise<boolean>} True if we can start a new REMOVE operation.
   */
  async canStartRemoveOperation(options = {}) {
    if (this.shouldPauseAdmissionReadForLocalRouterPressure(options)) {
      return false;
    }
    const cachedIncompleteOperations =
      await this.queryCachedIncompleteOperations();
    const cachedOperationCount = Array.isArray(cachedIncompleteOperations)
      ? cachedIncompleteOperations.length
      : NUM.ZERO;
    const cachedCount = cachedIncompleteOperations.filter(
      (operation) => operation?.type === OperationType.REMOVE,
    ).length;
    if (cachedOperationCount > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
    }
    if (cachedCount > NUM.ZERO) {
      if (cachedCount < this.config.maxConcurrentRemoves) {
        return true;
      }
      if (
        options?.concurrentBudgetReadMode !==
        REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
      ) {
        return false;
      }
      const authoritativeCount = await this.getConcurrentRemoveCount({
        partitionId: options.partitionId,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      const authoritativeObservation = this.getIncompleteOperationObservation();
      this.reconcileIncompleteOperationEmptyQueryDelay(
        authoritativeObservation,
      );
      if (
        this.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
          authoritativeObservation,
        )
      ) {
        return false;
      }
      return authoritativeCount < this.config.maxConcurrentRemoves;
    }
    const bypassEmptyQueryDelay =
      options?.bypassEmptyQueryDelay === true ||
      cachedOperationCount > NUM.ZERO;
    if (
      !bypassEmptyQueryDelay &&
      this.shouldDelayEmptyIncompleteOperationQuery()
    ) {
      return false;
    }
    const count = await this.getConcurrentRemoveCount({
      partitionId: options.partitionId,
    });
    const incompleteOperationObservation =
      this.getIncompleteOperationObservation();
    this.reconcileIncompleteOperationEmptyQueryDelay(
      incompleteOperationObservation,
    );
    if (
      this.shouldAllowEmergencyPriorityDeferredObservation(
        options.partitionId,
        incompleteOperationObservation,
      )
    ) {
      return count < this.config.maxConcurrentRemoves;
    }
    if (
      this.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
        incompleteOperationObservation,
      )
    ) {
      return false;
    }
    return count < this.config.maxConcurrentRemoves;
  }

  /**
   * Delay authoritative empty-owner scans until the cache has had one bounded
   * chance to observe local replica_operations rows. An empty cache is not
   * proof of zero operations; it is only a reason to wait briefly.
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  shouldDelayEmptyIncompleteOperationQuery(now = Date.now()) {
    const wfOwner = this.workflowOwner;
    if (
      !wfOwner ||
      wfOwner.incompleteOperationQueryEmptyBackoffMs <= NUM.ZERO
    ) {
      return false;
    }
    if (wfOwner.lastEmptyIncompleteOperationQueryAtMs <= NUM.ZERO) {
      wfOwner.lastEmptyIncompleteOperationQueryAtMs = now;
      return true;
    }
    if (
      now - wfOwner.lastEmptyIncompleteOperationQueryAtMs <
      wfOwner.incompleteOperationQueryEmptyBackoffMs
    ) {
      return true;
    }
    wfOwner.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    return false;
  }

  /**
   * Record one bounded empty-owner scan observation timestamp.
   * @param {number} [now=Date.now()]
   * @return {void}
   * @private
   */
  markEmptyIncompleteOperationQueryAt(now = Date.now()) {
    if (this.workflowOwner) {
      this.workflowOwner.lastEmptyIncompleteOperationQueryAtMs = now;
    }
  }

  /**
   * Clear bounded empty-owner scan deferral once local work is observed.
   * @return {void}
   * @private
   */
  clearEmptyIncompleteOperationQueryDelay() {
    if (this.workflowOwner) {
      this.workflowOwner.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    }
  }

  /**
   * Return true when the local router reports bounded outbound pressure and
   * non-critical scheduling should reuse existing observations instead of
   * issuing more routed control-plane reads.
   * @return {boolean}
   * @private
   */
  isLocalRouterBackpressured(options = {}) {
    return (
      this.getLocalRouterPressureDecision(options).action !==
      PRESSURE_GOVERNOR_ACTION.ALLOW
    );
  }

  /**
   * Only defer admission before the owner read when transport pressure has
   * already escalated past the bounded degrade state. Degrade must still flow
   * through the repository owner path so callers receive the canonical
   * deferred observation instead of cache-only silence.
   *
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldPauseAdmissionReadForLocalRouterPressure(options = {}) {
    const action = this.getLocalRouterPressureDecision(options).action;
    return (
      action === PRESSURE_GOVERNOR_ACTION.DEFER ||
      action === PRESSURE_GOVERNOR_ACTION.REJECT
    );
  }

  /**
   * Emergency transport-control partitions retain one reserved pressure lane.
   * When that reserved lane is still available, bounded background pressure
   * must not stop the next publication or replica-operations convergence step.
   *
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  hasContainedEmergencyPriorityPressure(partitionId = null) {
    if (!this.isEmergencyPriorityControlPlanePartition(partitionId)) {
      return false;
    }
    const decision = this.getLocalRouterPressureDecision({ partitionId });
    return (
      decision?.action === PRESSURE_GOVERNOR_ACTION.ALLOW &&
      decision?.summary?.backpressured === true
    );
  }

  /**
   * Emergency publication/replica-operation partitions may continue when the
   * owner read is deferred only because contained background pressure is being
   * absorbed by the reserved critical lane and no visible conflicting work
   * remains.
   *
   * @param {string|null} partitionId
   * @param {Object|null} observation
   * @return {boolean}
   * @private
   */
  shouldAllowEmergencyPriorityDeferredObservation(
    partitionId = null,
    observation = null,
  ) {
    if (
      observation?.state !== INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    ) {
      return false;
    }
    const operationCount = Number.isFinite(observation?.operationCount)
      ? Math.max(NUM.ZERO, Math.floor(observation.operationCount))
      : Array.isArray(observation?.operations)
        ? observation.operations.length
        : NUM.ZERO;
    if (operationCount > NUM.ZERO || !observation?.deferredOutcome) {
      return false;
    }
    return this.hasContainedEmergencyPriorityPressure(partitionId);
  }

  /**
   * Resolve one canonical local transport-pressure decision for coordinator
   * admission reads.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
}

export { RebalanceCoordinatorSegment5 };
