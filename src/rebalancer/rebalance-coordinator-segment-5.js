import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {RebalanceCoordinatorSegment4} from './rebalance-coordinator-segment-4.js';

const {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  OperationType,
  PRESSURE_GOVERNOR_ACTION,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  SERVICE_TYPE,
  WORKFLOW_STEP,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldPriorityRecoveryOperationBlockPlanning,
} = REBALANCE_COORDINATOR_SHARED;

const REBALANCE_COORDINATOR_OPERATION_FIELD = Object.freeze({
  CREATED_AT: 'createdAt',
  CREATED_AT_SNAKE: 'created_at',
  ENTITY_ID: 'entityId',
  ENTITY_ID_SNAKE: 'entity_id',
  PARTITION_ID: 'partitionId',
  PARTITION_ID_SNAKE: 'partition_id',
  UPDATED_AT: 'updatedAt',
  UPDATED_AT_SNAKE: 'updated_at',
  WORKFLOW_STEP: 'workflowStep',
  WORKFLOW_STEP_SNAKE: 'workflow_step',
});

const PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD = Object.freeze({
  BLOCKED_PARTITION_DETAIL_UNAVAILABLE: 'blockedPartitionDetailUnavailable',
  HAS_BLOCKED_PARTITION: 'hasBlockedPartition',
  PARTITION_ID: 'partitionId',
  RECOVERY_ACTIVE: 'recoveryActive',
});

const REBALANCE_COORDINATOR_TYPE = Object.freeze({
  FUNCTION: 'function',
  OBJECT: 'object',
});

const REBALANCE_COORDINATOR_SEGMENT_5_LITERAL = Object.freeze({
  EMPTY_STRING: '',
  PRESSURE_ACTION_UNAVAILABLE: 'pressure_action_unavailable',
});

const PRIORITY_ADD_ADMISSION_PRESSURE_STATE = Object.freeze({
  CLEAR: 'clear',
  PRIORITY_RECOVERY_ACTIVE: 'priority_recovery_active',
  PRESSURE_PAUSE: 'pressure_pause',
});

const PRIORITY_ADD_ADMISSION_PRESSURE_ACTION = Object.freeze({
  ALLOW_READ: 'allow_read',
  PAUSE_READ: 'pause_read',
});

const PRIORITY_ADD_ADMISSION_PRESSURE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRIORITY_RECOVERY_ACTIVE,
    matches: (evidence) =>
      evidence.priorityRecoveryPartitionActive === true,
  }),
  Object.freeze({
    state: PRIORITY_ADD_ADMISSION_PRESSURE_STATE.CLEAR,
    matches: (evidence) => evidence.pressureBlocked !== true,
  }),
  Object.freeze({
    state: PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRESSURE_PAUSE,
    matches: () => true,
  }),
]);

const PRIORITY_ADD_ADMISSION_PRESSURE_ACTION_BY_STATE = Object.freeze({
  [PRIORITY_ADD_ADMISSION_PRESSURE_STATE.CLEAR]:
    PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.ALLOW_READ,
  [PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRIORITY_RECOVERY_ACTIVE]:
    PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.ALLOW_READ,
  [PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRESSURE_PAUSE]:
    PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.PAUSE_READ,
});
const PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE = Object.freeze({
  PRIORITY_RECOVERY_ACTIVE: 'priority_recovery_active',
  EMERGENCY_VISIBILITY_RECOVERY: 'emergency_visibility_recovery',
  BLOCKED: 'blocked',
});
const PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state:
      PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.PRIORITY_RECOVERY_ACTIVE,
    matches: (evidence) =>
      evidence.priorityRecoveryPartitionActive === true &&
      evidence.backpressured === true,
  }),
  Object.freeze({
    state:
      PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE
        .EMERGENCY_VISIBILITY_RECOVERY,
    matches: (evidence) =>
      evidence.emergencyPriorityPartition === true &&
      evidence.backpressured === true,
  }),
  Object.freeze({
    state: PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.BLOCKED,
    matches: () => true,
  }),
]);
const PRIORITY_DEFERRED_OBSERVATION_PRESSURE_ALLOWED_STATES = new Set([
  PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.PRIORITY_RECOVERY_ACTIVE,
  PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.EMERGENCY_VISIBILITY_RECOVERY,
]);

function resolvePriorityAddAdmissionPressureState(evidence) {
  return (
    PRIORITY_ADD_ADMISSION_PRESSURE_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state || PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRESSURE_PAUSE
  );
}
function resolvePriorityDeferredObservationPressureState(evidence) {
  return (
    PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state || PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.BLOCKED
  );
}

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
    const cachedIncompleteOps = canUseCacheObservationBoundary ?
      await this.queryCachedIncompleteOperations() :
      [];
    const incompleteOperationObservation =
      await this.repository.getIncompleteOperationVisibilityObservation({
        cachedOperations: cachedIncompleteOps,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
      });
    const incompleteOps = Array.isArray(
      incompleteOperationObservation?.operations,
    ) ?
      incompleteOperationObservation.operations :
      [];
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
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  getObservedReplicaStatusFromCache(
    replicaId,
    partitionId,
    targetNodeId,
    options = {},
  ) {
    return this.repository.getObservedReplicaStatusFromCache(
      replicaId,
      partitionId,
      targetNodeId,
      options,
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
      typeof this.repository?.getOperationsByEntityAuthoritative ===
        REBALANCE_COORDINATOR_TYPE.FUNCTION
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
    return (await this.filterConcurrentAddBudgetOperations(
      inFlight,
      options,
    )).length;
  }

  /**
   * Resolve one partition id from either normalized operation records or raw
   * replica_operations rows.
   * @param {Object|null} operation
   * @return {string}
   * @private
   */
  getAddBudgetOperationPartitionId(operation = null) {
    return String(
      operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.PARTITION_ID] ||
        operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.PARTITION_ID_SNAKE] ||
        operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.ENTITY_ID] ||
        operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.ENTITY_ID_SNAKE] ||
        REBALANCE_COORDINATOR_SEGMENT_5_LITERAL.EMPTY_STRING,
    ).trim();
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
      const partitionId = this.getAddBudgetOperationPartitionId(operation);
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
   * @param {Map<string, Array<Object>>} priorityOperationsByPartitionId
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  addConcurrentPriorityBudgetOperation(
    priorityOperationsByPartitionId,
    operation,
  ) {
    const partitionId = this.getAddBudgetOperationPartitionId(operation);
    if (
      partitionId.length === NUM.ZERO ||
      !this.isPriorityControlPlanePartition(partitionId)
    ) {
      return false;
    }
    if (!priorityOperationsByPartitionId.has(partitionId)) {
      priorityOperationsByPartitionId.set(partitionId, []);
    }
    priorityOperationsByPartitionId.get(partitionId).push(operation);
    return true;
  }

  /**
   * @param {Array<Object>} filteredOperations
   * @param {string} partitionId
   * @param {Array<Object>} partitionOperations
   * @return {Promise<void>}
   * @private
   */
  async appendConcurrentPriorityPartitionOperations(
    filteredOperations,
    partitionId,
    partitionOperations,
    options = {},
  ) {
    const partitionAssessment =
      await this.buildPriorityPartitionAddBudgetAssessment(
        partitionId,
        partitionOperations,
      );
    if (
      partitionAssessment &&
      !shouldPriorityRecoveryOperationBlockPlanning(partitionAssessment)
    ) {
      return;
    }
    if (partitionAssessment) {
      filteredOperations.push(...partitionOperations);
      return;
    }
    if (
      this.shouldIgnorePriorityPartitionAddBudgetByAdmissionPlan(
        partitionId,
        partitionOperations,
        options,
      )
    ) {
      return;
    }
    for (const operation of partitionOperations) {
      if (await this.shouldIgnoreCriticalAddBudgetOperation(operation)) {
        continue;
      }
      filteredOperations.push(operation);
    }
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
  async filterConcurrentAddBudgetOperations(operations = [], options = {}) {
    const filteredOperations = [];
    const priorityOperationsByPartitionId = new Map();
    for (const operation of Array.isArray(operations) ? operations : []) {
      if (!this.isConcurrentAddBudgetOperation(operation)) {
        continue;
      }
      if (
        this.addConcurrentPriorityBudgetOperation(
          priorityOperationsByPartitionId,
          operation,
        )
      ) {
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
      await this.appendConcurrentPriorityPartitionOperations(
        filteredOperations,
        partitionId,
        partitionOperations,
        options,
      );
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
    const normalizedPartitionId = String(partitionId || '').trim();
    if (normalizedPartitionId.length === NUM.ZERO) {
      return null;
    }
    const partitionOperations = Array.isArray(operations) ?
      operations.filter((operation) => {
        const operationPartitionId =
          this.getAddBudgetOperationPartitionId(operation);
        return operationPartitionId === normalizedPartitionId;
      }) :
      [];
    if (partitionOperations.length === NUM.ZERO) {
      return null;
    }
    const representativeOperation = partitionOperations.find(Boolean) || null;
    if (!representativeOperation) {
      return null;
    }
    if (
      typeof this.workflowOwner
        ?.getPriorityRecoveryDecisionSnapshotForPartitionOperations ===
      REBALANCE_COORDINATOR_TYPE.FUNCTION
    ) {
      const decisionSnapshot =
        await this.workflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          normalizedPartitionId,
          partitionOperations,
        );
      if (
        decisionSnapshot &&
        typeof decisionSnapshot === REBALANCE_COORDINATOR_TYPE.OBJECT
      ) {
        return decisionSnapshot;
      }
    }
    if (
      typeof this.workflowOwner
        ?.getPriorityRecoveryPlanningSnapshotForOperation !==
      REBALANCE_COORDINATOR_TYPE.FUNCTION
    ) {
      return null;
    }
    const planningSnapshot =
      await this.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation(
        representativeOperation,
      );
    if (
      !planningSnapshot ||
      typeof planningSnapshot !== REBALANCE_COORDINATOR_TYPE.OBJECT
    ) {
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
   * Admission planning already owns the current blocked-priority partition set.
   * When runtime workflow evidence is unavailable, use that canonical set to
   * avoid letting stale spread-satisfied rows monopolize the add lane.
   * @param {string} partitionId
   * @param {Array<Object>} partitionOperations
   * @return {boolean}
   * @private
   */
  shouldIgnorePriorityPartitionAddBudgetByAdmissionPlan(
    partitionId,
    partitionOperations = [],
    options = {},
  ) {
    const normalizedPartitionId = String(partitionId || '').trim();
    if (normalizedPartitionId.length === NUM.ZERO) {
      return false;
    }
    if (
      !this.arePriorityPartitionAddBudgetOperationsPastWorkflowTimeout(
        partitionOperations,
      )
    ) {
      return false;
    }
    const admissionPlan = this.getPriorityRecoveryAdmissionPlan();
    if (
      admissionPlan?.[
        PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.RECOVERY_ACTIVE
      ] !== true ||
      admissionPlan?.[
        PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD
          .BLOCKED_PARTITION_DETAIL_UNAVAILABLE
      ] === true ||
      typeof admissionPlan?.[
        PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.HAS_BLOCKED_PARTITION
      ] !== REBALANCE_COORDINATOR_TYPE.FUNCTION
    ) {
      return false;
    }
    const requestedPartitionId =
      this.resolveRequestedPriorityAddBudgetPartitionId(options);
    const requestedDifferentBlockedPartition =
      requestedPartitionId.length > NUM.ZERO &&
      requestedPartitionId !== normalizedPartitionId &&
      admissionPlan[
        PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.HAS_BLOCKED_PARTITION
      ](requestedPartitionId) === true;
    const currentPartitionStillBlocked =
      admissionPlan[
        PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.HAS_BLOCKED_PARTITION
      ](normalizedPartitionId) === true;
    return (
      requestedDifferentBlockedPartition ||
      currentPartitionStillBlocked !== true
    );
  }

  /**
   * @param {Object} options
   * @return {string}
   * @private
   */
  resolveRequestedPriorityAddBudgetPartitionId(options = {}) {
    return String(
      options?.[PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.PARTITION_ID] ||
        REBALANCE_COORDINATOR_SEGMENT_5_LITERAL.EMPTY_STRING,
    ).trim();
  }

  /**
   * @param {Array<Object>} operations
   * @return {boolean}
   * @private
   */
  arePriorityPartitionAddBudgetOperationsPastWorkflowTimeout(operations = []) {
    const partitionOperations = Array.isArray(operations) ? operations : [];
    if (partitionOperations.length === NUM.ZERO) {
      return false;
    }
    return partitionOperations.every((operation) =>
      this.isAddBudgetOperationPastWorkflowTimeout(operation),
    );
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  isAddBudgetOperationPastWorkflowTimeout(operation = null) {
    const workflowStep = String(
      operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.WORKFLOW_STEP] ||
        operation?.[
          REBALANCE_COORDINATOR_OPERATION_FIELD.WORKFLOW_STEP_SNAKE
        ] ||
        '',
    ).trim();
    if (workflowStep.length === NUM.ZERO) {
      return false;
    }
    const observedAtMs = Number(
      operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.UPDATED_AT] ??
        operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.UPDATED_AT_SNAKE] ??
        operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.CREATED_AT] ??
        operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.CREATED_AT_SNAKE],
    );
    if (!Number.isFinite(observedAtMs)) {
      return false;
    }
    const timeoutMs = this.getTimeoutForStep(workflowStep, operation);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= NUM.ZERO) {
      return false;
    }
    return this.nowFn() - observedAtMs >= timeoutMs;
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
      await this.filterConcurrentAddBudgetOperations(inFlight, options),
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
    if (!operation || typeof operation !== REBALANCE_COORDINATOR_TYPE.OBJECT) {
      return false;
    }
    const type = String(
      operation.type || REBALANCE_COORDINATOR_SEGMENT_5_LITERAL.EMPTY_STRING,
    ).toUpperCase();
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
    const cachedOperationCount = Array.isArray(cachedIncompleteOperations) ?
      cachedIncompleteOperations.length :
      NUM.ZERO;
    const cachedAddBudgetCandidateCount = (
      Array.isArray(cachedIncompleteOperations) ?
        cachedIncompleteOperations :
        []
    ).filter((operation) =>
      this.isConcurrentAddBudgetOperation(operation),
    ).length;
    if (
      cachedAddBudgetCandidateCount >= concurrentAddLimit &&
      options?.concurrentBudgetReadMode !==
        REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
    ) {
      return false;
    }
    const cachedCount = (
      await this.filterConcurrentAddBudgetOperations(
        cachedIncompleteOperations,
        options,
      )
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
      this.shouldAllowPriorityRecoveryDeferredObservation(
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
    if (this.shouldPausePriorityAddAdmissionReadForLocalRouterPressure(
      options,
    )) {
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
    const cachedOperationCount = Array.isArray(cachedIncompleteOperations) ?
      cachedIncompleteOperations.length :
      NUM.ZERO;
    const cachedCounts = this.buildConcurrentAddCountByPriorityClass(
      await this.filterConcurrentAddBudgetOperations(
        cachedIncompleteOperations,
        options,
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
        this.shouldAllowPriorityRecoveryDeferredObservation(
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
      this.shouldAllowPriorityRecoveryDeferredObservation(
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
    const cachedOperationCount = Array.isArray(cachedIncompleteOperations) ?
      cachedIncompleteOperations.length :
      NUM.ZERO;
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
      this.shouldAllowPriorityRecoveryDeferredObservation(
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
   * Priority-recovery partitions that remain blocked in the canonical
   * admission plan may keep moving when transport pressure is contained to the
   * bounded backpressure state.
   *
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  hasContainedPriorityRecoveryPressure(partitionId = null) {
    const normalizedPartitionId = String(partitionId || '').trim();
    if (normalizedPartitionId.length === NUM.ZERO) {
      return false;
    }
    const decision = this.getLocalRouterPressureDecision({partitionId});
    const evidence = this.buildPriorityDeferredObservationPressureEvidence({
      partitionId,
      pressureDecision: decision,
    });
    const state = resolvePriorityDeferredObservationPressureState(evidence);
    return PRIORITY_DEFERRED_OBSERVATION_PRESSURE_ALLOWED_STATES.has(state);
  }

  /**
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {Object|null} options.pressureDecision
   * @return {Object}
   * @private
   */
  buildPriorityDeferredObservationPressureEvidence(options = {}) {
    const partitionId = String(options.partitionId || '').trim();
    const pressureDecision =
      options.pressureDecision && typeof options.pressureDecision === 'object' ?
        options.pressureDecision :
        this.getLocalRouterPressureDecision(options);
    const admissionEvidence = this.buildPriorityAddAdmissionPressureEvidence({
      partitionId,
      pressureDecision,
    });
    return Object.freeze({
      priorityRecoveryPartitionActive:
        admissionEvidence.priorityRecoveryPartitionActive === true,
      emergencyPriorityPartition:
        partitionId.length > NUM.ZERO &&
        this.isEmergencyPriorityControlPlanePartition(partitionId),
      backpressured: pressureDecision?.summary?.backpressured === true,
    });
  }

  /**
   * Blocked priority-recovery partitions may continue when the owner read is
   * deferred only because contained background pressure is being absorbed and
   * no visible conflicting work remains.
   *
   * @param {string|null} partitionId
   * @param {Object|null} observation
   * @return {boolean}
   * @private
   */
  shouldAllowPriorityRecoveryDeferredObservation(
    partitionId = null,
    observation = null,
  ) {
    if (
      observation?.state !== INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    ) {
      return false;
    }
    const operationCount = Number.isFinite(observation?.operationCount) ?
      Math.max(NUM.ZERO, Math.floor(observation.operationCount)) :
      Array.isArray(observation?.operations) ?
        observation.operations.length :
        NUM.ZERO;
    if (operationCount > NUM.ZERO || !observation?.deferredOutcome) {
      return false;
    }
    return this.hasContainedPriorityRecoveryPressure(partitionId);
  }

  /**
   * @param {string} partitionId
   * @return {Object}
   * @private
   */
  resolvePriorityRecoveryPlanningEvidence(partitionId) {
    const resolvePlanningSnapshot =
      this.repository?.resolvePriorityRecoveryPlanningSnapshotForOwnerRead;
    const planningSnapshot =
      typeof resolvePlanningSnapshot === REBALANCE_COORDINATOR_TYPE.FUNCTION ?
        resolvePlanningSnapshot.call(this.repository) :
        null;
    const isPlanningRecoveryActive =
      this.repository?.isPriorityRecoveryOwnerReadActive;
    const recoveryActive =
      typeof isPlanningRecoveryActive === REBALANCE_COORDINATOR_TYPE.FUNCTION ?
        isPlanningRecoveryActive.call(this.repository, planningSnapshot) :
        false;
    const partitionAssessment = buildPriorityRecoveryPartitionAssessment({
      partitionId,
      priorityPartitionSummary:
        planningSnapshot?.priorityPartitionSummary || null,
    });
    return Object.freeze({
      recoveryActive,
      blockedPriorityPartition:
        partitionAssessment?.planner?.ready === false,
    });
  }

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildPriorityAddAdmissionPressureEvidence(options = {}) {
    const partitionId = String(options.partitionId || '').trim();
    const pressureDecision =
      options.pressureDecision && typeof options.pressureDecision === 'object' ?
        options.pressureDecision :
        this.getLocalRouterPressureDecision(options);
    const priorityRecoveryAdmissionPlan =
      this.getPriorityRecoveryAdmissionPlan();
    const hasBlockedPartition =
      typeof priorityRecoveryAdmissionPlan?.hasBlockedPartition ===
      REBALANCE_COORDINATOR_TYPE.FUNCTION ?
        priorityRecoveryAdmissionPlan.hasBlockedPartition(partitionId) :
        false;
    const planningEvidence =
      this.resolvePriorityRecoveryPlanningEvidence(partitionId);
    const emergencyPriorityRecoveryPartition =
      partitionId.length > NUM.ZERO &&
      priorityRecoveryAdmissionPlan?.emergencyRecoveryActive === true &&
      this.isEmergencyPriorityControlPlanePartition(partitionId);
    const priorityRecoveryActive =
      priorityRecoveryAdmissionPlan?.recoveryActive === true ||
      planningEvidence.recoveryActive === true;
    const blockedPriorityPartition =
      hasBlockedPartition === true ||
      planningEvidence.blockedPriorityPartition === true;
    const priorityRecoveryPartitionActive =
      priorityRecoveryActive === true &&
      (
        blockedPriorityPartition === true ||
        emergencyPriorityRecoveryPartition === true
      );
    const pressureBlocked =
      pressureDecision?.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
      pressureDecision?.action === PRESSURE_GOVERNOR_ACTION.REJECT;
    return Object.freeze({
      partitionId,
      pressureAction:
        pressureDecision?.action ||
        REBALANCE_COORDINATOR_SEGMENT_5_LITERAL.PRESSURE_ACTION_UNAVAILABLE,
      pressureBlocked,
      priorityRecoveryActive,
      blockedPriorityPartition,
      emergencyPriorityRecoveryPartition,
      priorityRecoveryPartitionActive,
    });
  }

  /**
   * @param {Object} [options={}]
   * @return {string}
   * @private
   */
  resolvePriorityAddAdmissionPressureAction(options = {}) {
    const evidence = this.buildPriorityAddAdmissionPressureEvidence(options);
    const state = resolvePriorityAddAdmissionPressureState(evidence);
    return (
      PRIORITY_ADD_ADMISSION_PRESSURE_ACTION_BY_STATE[state] ||
      PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.PAUSE_READ
    );
  }

  /**
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldPausePriorityAddAdmissionReadForLocalRouterPressure(options = {}) {
    return (
      this.resolvePriorityAddAdmissionPressureAction(options) ===
      PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.PAUSE_READ
    );
  }

  /**
   * Resolve one canonical local transport-pressure decision for coordinator
   * admission reads.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
}

export {RebalanceCoordinatorSegment5};
