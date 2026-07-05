import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  getConcurrentAddBudgetLimit,
  getLatestMembershipPublicationRow,
  getPriorityConcurrentAddBudgetLimit,
  getPriorityRecoveryAdmissionPlan,
  getReservedCreateAddSlots,
  getReservedPriorityRecoveryAddSlots,
  isGenuineServiceCreateAdmission,
  isEmergencyPriorityControlPlanePartition,
  isEmergencyPriorityControlPlaneRecoveryActive,
  isGlobalPriorityControlPlaneRecoveryActive,
  resolveConcurrentBudgetReadMode,
  resolveConcurrentCreateBudgetScope,
  runConcurrentCreateBudgetGate,
  shouldBypassConcurrentBudgetEmptyBackoff,
  shouldUsePriorityConcurrentAddLane,
} from './rebalance-coordinator-concurrent-add-budget.js';

const LOCAL_STR_CRITICAL_PARTITION = 'Critical partition ';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_IN_FLIGHT = 'in flight';
const LOCAL_STR_OBJECT = 'object';

const {
  OperationType,
  ReplicaStatus,
  SERVICE_TYPE,
  WORKFLOW_STEP,
  buildPriorityRecoveryOperationAssessment,
  isPriorityControlPlanePartitionTable,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldPriorityRecoveryOperationBlockPlanning,
} = REBALANCE_COORDINATOR_SHARED;

const LOCAL_STR_CRITICAL_LANE_HELD_OVER_TARGET =
  'critical-partition create lane held: over target on alive replicas';

// Statuses that PHYSICALLY occupy a partition slot: a live replica (active) OR a
// source still draining (removing) -- the latter is the over-replication surplus
// itself (a REPLACE source-removal whose drain lags), so it MUST count or the
// hold never sees the surplus. Coming-up statuses (pending/creating/syncing) are
// deliberately excluded so a 0->N provisioning fan-out still admits until the Nth
// lands; removed/failed are gone and never count.
const LANE_OCCUPANCY_STATUSES = new Set([
  ReplicaStatus.ACTIVE,
  ReplicaStatus.REMOVING,
]);

const ENTITY_SERIALIZED_ADD_LIKE_OPERATION_TYPES = Object.freeze([
  OperationType.ADD,
  OperationType.REPLACE,
]);
const PRIORITY_CONTROL_PLANE_REMOVE_LANE_WORKFLOW_STEPS_BY_TYPE =
  Object.freeze(
    new Map([
      [
        OperationType.REMOVE,
        new Set([
          WORKFLOW_STEP.PENDING,
          WORKFLOW_STEP.SENDING,
          WORKFLOW_STEP.STOPPING,
        ]),
      ],
      [
        OperationType.REPLACE,
        new Set([
          WORKFLOW_STEP.PENDING,
          WORKFLOW_STEP.SENDING,
          WORKFLOW_STEP.CREATING,
          WORKFLOW_STEP.SYNCING,
          WORKFLOW_STEP.ACTIVE,
          WORKFLOW_STEP.STOPPING,
        ]),
      ],
    ]),
  );
const PRIORITY_CONTROL_PLANE_REMOVE_LANE_CONFLICT_MESSAGE_PREFIX =
  'Priority control-plane partition ';
const PRIORITY_CONTROL_PLANE_REMOVE_LANE_CONFLICT_MESSAGE_SUFFIX =
  ' already has a remove-like operation in flight';

class RebalanceCoordinatorPriorityBudgetAdmissionMethods {
  /**
   * Determine whether this create request should enforce coordinator-level
   * concurrent operation budgets.
   * @param {Object} move
   * @param {string|null} normalizedMoveType
   * @return {boolean}
   * @private
   */
  shouldEnforceConcurrentOperationBudget(move, normalizedMoveType) {
    if (move?.enforceConcurrentOperationBudget !== true) {
      return false;
    }
    return (
      normalizedMoveType === OperationType.ADD ||
      normalizedMoveType === OperationType.REPLACE ||
      normalizedMoveType === OperationType.REMOVE
    );
  }

  /**
   * Resolve the first priority add-like operation that should keep the
   * critical create lane closed.
   * @param {Array<Object>} operations
   * @return {Promise<Object|null>}
   * @private
   */
  async findCriticalAddLikeConflictingOperation(operations = []) {
    for (const operation of Array.isArray(operations) ? operations : []) {
      if (!operation || this.isOperationTerminal(operation)) {
        continue;
      }
      if (!this.isConcurrentAddBudgetOperation(operation)) {
        continue;
      }
      if (await this.shouldIgnoreCriticalAddBudgetOperation(operation)) {
        continue;
      }
      return operation;
    }
    return null;
  }

  /**
   * Critical system partitions admit only one add-like workflow at a time.
   * This prevents multiple replacement learners from racing ahead of the
   * source-removal phase and creating temporary 5-voter critical groups.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureCriticalPartitionCreateLaneAvailable(context) {
    const normalizedMoveType = context?.normalizedMoveType;
    if (context?.move?.enforceConcurrentOperationBudget !== true) {
      return;
    }
    if (
      normalizedMoveType !== OperationType.ADD &&
      normalizedMoveType !== OperationType.REPLACE
    ) {
      return;
    }
    if (!this.isCriticalSystemPartition(context?.partitionId)) {
      return;
    }

    const operationObservation =
      await this.getEntityAuthoritativeOperationObservation(
        context?.entityType || SERVICE_TYPE.PARTITION,
        context?.entityId || context?.partitionId,
      );
    const existingOperations = Array.isArray(operationObservation?.operations) ?
      operationObservation.operations :
      [];
    let conflictingOperation =
      await this.findCriticalAddLikeConflictingOperation(existingOperations);
    if (!conflictingOperation && operationObservation?.deferredOutcome) {
      conflictingOperation =
        await this.findCriticalAddLikeConflictingOperation(
          this.getCacheVisibleEntityOperations(context),
        );
    }
    if (!conflictingOperation && operationObservation?.deferredOutcome) {
      if (
        this.shouldAllowPriorityRecoveryDeferredObservation(
          context?.partitionId,
          operationObservation,
        )
      ) {
        return;
      }
      throw this.createDeferredOperationVisibilityError(
        normalizedMoveType,
        operationObservation,
        {
          partitionId: context?.partitionId || null,
          entityType: context?.entityType || SERVICE_TYPE.PARTITION,
          entityId: context?.entityId || context?.partitionId || null,
        },
      );
    }
    if (!conflictingOperation) {
      await this.holdCriticalPartitionCreateLaneIfOverTarget(context);
      return;
    }

    throw this.createConcurrentOperationBudgetError(
      normalizedMoveType,
      1,
      {
        message:
          LOCAL_STR_CRITICAL_PARTITION +
          `${context.partitionId} already has an add-like operation ` +
          LOCAL_STR_IN_FLIGHT,
        conflictingOperationId: conflictingOperation.operationId,
      },
    );
  }

  /**
   * Count-keyed lane hold (structural goal-owner, Increment 1). Even when no
   * add-like operation currently holds the critical create lane -- because a
   * prior op released it on spread-satisfaction, or its REMOVED step terminalized
   * while the source replica row still lags -- keep the lane CLOSED for a new
   * add-like op (ADD inflow OR REPLACE churn) while the partition is STRICTLY over
   * its replica target on ALIVE replicas. This is the in-flight + liveness window
   * the rows-only distinct-node ADD guard misses and the reason the
   * over-replication surplus (REPLACE source-removals whose drain lags) keeps
   * re-growing on the saturated coordinator.
   *
   * Alive-guard: a replica on a not-ready node is not counted, so (a) a legitimate
   * REPLACE draining a replica off a restarting node still admits (occupied <=
   * target) and (b) a dead replica's slot frees for re-placement. REMOVE never
   * reaches this lane, so the surplus-draining removal always proceeds and the
   * count falls back to target -- the hold is transient, never a deadlock. Fails
   * OPEN if the authoritative row read is unavailable (never blocks on a read gap).
   *
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async holdCriticalPartitionCreateLaneIfOverTarget(context) {
    const targetReplicaCount =
      await this.resolveTopologyGuardTargetReplicaCount({
        partitionId: context?.partitionId,
        entityType: context?.entityType || SERVICE_TYPE.PARTITION,
      });
    if (!Number.isFinite(targetReplicaCount) || targetReplicaCount <= 0) {
      return;
    }
    const serviceRows = await this.getAuthoritativeEntityServiceRows({
      partitionId: context?.partitionId,
      entityType: context?.entityType || SERVICE_TYPE.PARTITION,
      entityId: context?.entityId || context?.partitionId,
    });
    if (!Array.isArray(serviceRows) || serviceRows.length === 0) {
      return;
    }
    let occupiedAliveCount = 0;
    for (const row of serviceRows) {
      const status = String(row?.status || ReplicaStatus.ACTIVE).toLowerCase();
      if (!LANE_OCCUPANCY_STATUSES.has(status)) {
        continue;
      }
      const nodeId = row?.node_id || row?.nodeId;
      if (!nodeId || !this.isNodeReadyForRouting(nodeId)) {
        continue;
      }
      occupiedAliveCount += 1;
    }
    if (occupiedAliveCount <= targetReplicaCount) {
      return;
    }
    this.logger?.info?.(LOCAL_STR_CRITICAL_LANE_HELD_OVER_TARGET, {
      partitionId: context?.partitionId || null,
      occupiedAliveCount,
      targetReplicaCount,
      normalizedMoveType: context?.normalizedMoveType || null,
    });
    throw this.createConcurrentOperationBudgetError(
      context?.normalizedMoveType,
      1,
      {
        message:
          LOCAL_STR_CRITICAL_PARTITION +
          `${context.partitionId} at ${occupiedAliveCount} alive replicas over ` +
          `target ${targetReplicaCount}; holding add-like create ` +
          LOCAL_STR_IN_FLIGHT,
      },
    );
  }

  /**
   * @param {Array<Object>} operations
   * @return {Object|null}
   * @private
   */
  findEntityAddLikeConflictingOperation(operations = []) {
    return (
      (Array.isArray(operations) ? operations : []).find((operation) => {
        if (
          !operation ||
          this.isOperationTerminal(operation) ||
          operation.type !== OperationType.REPLACE
        ) {
          return false;
        }
        return this.isReplaceRemoveDispatchPhase(operation);
      }) || null
    );
  }

  /**
   * @param {Object} context
   * @return {Array<Object>}
   * @private
   */
  getCacheVisibleEntityOperations(context) {
    return this.getEntityInFlightOperationRows({
      entityType: context?.entityType || SERVICE_TYPE.PARTITION,
      entityId: context?.entityId || context?.partitionId,
    })
      .map((operationRow) => this.rowToOperation(operationRow))
      .filter(Boolean);
  }

  /**
   * One entity must not admit a second add-like workflow while an earlier
   * REPLACE already owns source-removal progression for that same entity.
   * This keeps the authoritative operation grammar linear without blocking
   * unrelated entities across the cluster.
   *
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureEntityAddLikeCreateLaneAvailable(context) {
    const normalizedMoveType = context?.normalizedMoveType;
    if (!ENTITY_SERIALIZED_ADD_LIKE_OPERATION_TYPES.includes(
      normalizedMoveType,
    )) {
      return;
    }

    const operationObservation =
      await this.getEntityAuthoritativeOperationObservation(
        context?.entityType || SERVICE_TYPE.PARTITION,
        context?.entityId || context?.partitionId,
      );
    const operations = Array.isArray(operationObservation?.operations) ?
      operationObservation.operations :
      [];
    let conflictingOperation =
      this.findEntityAddLikeConflictingOperation(operations);
    if (!conflictingOperation && operationObservation?.deferredOutcome) {
      const cacheVisibleOperations = this.getCacheVisibleEntityOperations(
        context,
      );
      conflictingOperation = this.findEntityAddLikeConflictingOperation(
        cacheVisibleOperations,
      );
      if (
        !conflictingOperation &&
        this.isPriorityControlPlanePartition(context?.partitionId)
      ) {
        const cacheVisibleAddLikeConflict =
          await this.findCriticalAddLikeConflictingOperation(
            cacheVisibleOperations,
          );
        if (cacheVisibleAddLikeConflict) {
          throw this.createConcurrentOperationBudgetError(
            normalizedMoveType,
            1,
            {
              message:
                LOCAL_STR_CRITICAL_PARTITION +
                `${context.partitionId} already has an add-like operation ` +
                LOCAL_STR_IN_FLIGHT,
              conflictingOperationId:
                cacheVisibleAddLikeConflict.operationId,
            },
          );
        }
      }
    }
    if (!conflictingOperation && operationObservation?.deferredOutcome) {
      if (
        this.shouldAllowPriorityRecoveryDeferredObservation(
          context?.partitionId,
          operationObservation,
        )
      ) {
        return;
      }
      throw this.createDeferredOperationVisibilityError(
        normalizedMoveType,
        operationObservation,
        {
          partitionId: context?.partitionId || null,
          entityType: context?.entityType || SERVICE_TYPE.PARTITION,
          entityId: context?.entityId || context?.partitionId || null,
        },
      );
    }
    if (!conflictingOperation) {
      return;
    }

    throw this.createEntityConflictingOperationInFlightError(
      normalizedMoveType,
      context?.entityId || context?.partitionId || null,
      conflictingOperation,
    );
  }

  /**
   * Priority recovery rows that already satisfy spread or no longer target the
   * current eligible cohort must not keep blocking the next add-like action.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async shouldIgnoreCriticalAddBudgetOperation(operation) {
    if (
      !operation ||
      !isPriorityControlPlanePartitionTable({
        partitionId: operation.partitionId,
      })
    ) {
      return false;
    }
    if (
      typeof this.workflowOwner
        ?.getPriorityRecoveryDecisionSnapshotForOperation === LOCAL_STR_FUNCTION
    ) {
      const decisionSnapshot =
        await this.workflowOwner.getPriorityRecoveryDecisionSnapshotForOperation(
          operation,
        );
      if (decisionSnapshot && typeof decisionSnapshot === LOCAL_STR_OBJECT) {
        return !shouldPriorityRecoveryOperationBlockPlanning(decisionSnapshot);
      }
    }
    if (
      typeof this.workflowOwner
        ?.getPriorityRecoveryPlanningSnapshotForOperation !== LOCAL_STR_FUNCTION
    ) {
      return false;
    }
    const planningSnapshot =
      await this.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation(
        operation,
      );
    if (!planningSnapshot || typeof planningSnapshot !== LOCAL_STR_OBJECT) {
      return false;
    }
    const assessment = buildPriorityRecoveryOperationAssessment({
      operation,
      priorityPartitionSummary:
        planningSnapshot.priorityPartitionSummary || null,
      effectiveEligibleNodeIds:
        resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds,
    });
    return !shouldPriorityRecoveryOperationBlockPlanning(assessment);
  }

  /**
   * Prevent conflicting REMOVE scheduling while a REPLACE workflow already
   * owns the same source/target replica lifecycle.
   *
   * This guard uses authoritative operation rows to avoid cache-staleness
   * races where planner-side pending-move tracking can lag behind a REPLACE
   * transition and allow an overlapping REMOVE to be created.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureNoConflictingInFlightReplaceForRemove(context) {
    if (context?.normalizedMoveType !== OperationType.REMOVE) {
      return;
    }
    const replicaId = String(context?.move?.replicaId || '').trim();
    if (replicaId.length === 0) {
      return;
    }

    const operationObservation =
      await this.getEntityAuthoritativeOperationObservation(
        context?.entityType || SERVICE_TYPE.PARTITION,
        context?.entityId || context?.partitionId,
      );
    const operations = Array.isArray(operationObservation?.operations) ?
      operationObservation.operations :
      [];
    const conflictingOperation = operations.find((operation) => {
      if (
        !operation ||
        this.isOperationTerminal(operation) ||
        operation.type !== OperationType.REPLACE
      ) {
        return false;
      }
      if (operation.operationId === context?.move?.operationId) {
        return false;
      }
      const replaceSourceReplicaId = this.getReplaceSourceReplicaId(operation);
      const replaceTargetReplicaId = this.getReplaceTargetReplicaId(operation);
      return (
        replicaId === replaceSourceReplicaId ||
        replicaId === replaceTargetReplicaId
      );
    });
    if (!conflictingOperation && operationObservation?.deferredOutcome) {
      if (
        this.shouldAllowPriorityRecoveryDeferredObservation(
          context?.partitionId,
          operationObservation,
        )
      ) {
        return;
      }
      throw this.createDeferredOperationVisibilityError(
        context?.normalizedMoveType,
        operationObservation,
        {
          partitionId: context?.partitionId || null,
          entityType: context?.entityType || SERVICE_TYPE.PARTITION,
          entityId: context?.entityId || context?.partitionId || null,
          replicaId,
        },
      );
    }
    if (!conflictingOperation) {
      return;
    }

    throw this.createConflictingOperationInFlightError(
      context?.normalizedMoveType,
      replicaId,
      conflictingOperation,
    );
  }

  /**
   * Priority control-plane partitions cannot safely trim a second voter while
   * any earlier remove-like lifecycle is unresolved for that same partition.
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isPriorityControlPlaneRemoveLaneOperation(operation) {
    if (!operation || this.isOperationTerminal(operation)) {
      return false;
    }
    const workflowSteps =
      PRIORITY_CONTROL_PLANE_REMOVE_LANE_WORKFLOW_STEPS_BY_TYPE.get(
        operation.type,
      );
    return workflowSteps?.has(operation.workflowStep) === true;
  }

  /**
   * @param {Array<Object>} operations
   * @param {Object} context
   * @return {Object|null}
   * @private
   */
  findPriorityControlPlaneRemoveLaneConflict(operations = [], context = {}) {
    const currentOperationId = String(
      context?.move?.operationId || '',
    ).trim();
    return (
      (Array.isArray(operations) ? operations : []).find((operation) => {
        if (operation?.operationId === currentOperationId) {
          return false;
        }
        return this.isPriorityControlPlaneRemoveLaneOperation(operation);
      }) || null
    );
  }

  /**
   * Serialize priority control-plane trim with existing remove-like lifecycles.
   *
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensurePriorityControlPlaneRemoveLaneAvailable(context) {
    const normalizedMoveType = context?.normalizedMoveType;
    if (normalizedMoveType !== OperationType.REMOVE) {
      return;
    }
    if (!this.isPriorityControlPlanePartition(context?.partitionId)) {
      return;
    }

    const operationObservation =
      await this.getEntityAuthoritativeOperationObservation(
        context?.entityType || SERVICE_TYPE.PARTITION,
        context?.entityId || context?.partitionId,
      );
    const operations = Array.isArray(operationObservation?.operations) ?
      operationObservation.operations :
      [];
    let conflictingOperation =
      this.findPriorityControlPlaneRemoveLaneConflict(operations, context);
    if (!conflictingOperation && operationObservation?.deferredOutcome) {
      conflictingOperation =
        this.findPriorityControlPlaneRemoveLaneConflict(
          this.getCacheVisibleEntityOperations(context),
          context,
        );
    }
    if (!conflictingOperation && operationObservation?.deferredOutcome) {
      if (
        this.shouldAllowPriorityRecoveryDeferredObservation(
          context?.partitionId,
          operationObservation,
        )
      ) {
        return;
      }
      throw this.createDeferredOperationVisibilityError(
        normalizedMoveType,
        operationObservation,
        {
          partitionId: context?.partitionId || null,
          entityType: context?.entityType || SERVICE_TYPE.PARTITION,
          entityId: context?.entityId || context?.partitionId || null,
          replicaId: context?.move?.replicaId || null,
        },
      );
    }
    if (!conflictingOperation) {
      return;
    }

    throw this.createConcurrentOperationBudgetError(
      normalizedMoveType,
      1,
      {
        message:
          PRIORITY_CONTROL_PLANE_REMOVE_LANE_CONFLICT_MESSAGE_PREFIX +
          String(context.partitionId) +
          PRIORITY_CONTROL_PLANE_REMOVE_LANE_CONFLICT_MESSAGE_SUFFIX,
        conflictingOperationId: conflictingOperation.operationId,
      },
    );
  }

  /**
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureCriticalPartitionRemoveLaneAvailable(context) {
    return this.ensurePriorityControlPlaneRemoveLaneAvailable(context);
  }

  /**
   * Serialize create admission through one add-like or remove-like budget lane.
   * @param {string|null} normalizedMoveType
   * @param {Object} [budgetContext={}]
   * @param {Function} executionFactory
   * @return {Promise<*>}
   * @private
   */
  async runConcurrentCreateBudgetGate(
    normalizedMoveType,
    budgetContext = {},
    executionFactory,
  ) {
    return runConcurrentCreateBudgetGate(
      this,
      normalizedMoveType,
      budgetContext,
      executionFactory,
    );
  }

  /**
   * Keep emergency priority recovery admission off the ordinary create-budget
   * single-flight lane so unrelated add scheduling cannot head-of-line block
   * the control-plane partitions that publish and execute recovery itself.
   * @param {string|null} normalizedMoveType
   * @param {Object} [budgetContext={}]
   * @return {string}
   * @private
   */
  resolveConcurrentCreateBudgetScope(normalizedMoveType, budgetContext = {}) {
    return resolveConcurrentCreateBudgetScope(
      this,
      normalizedMoveType,
      budgetContext,
    );
  }

  /**
   * Critical system partitions must not be starved behind the empty-cache
   * observation backoff. The backoff guards cache freshness, but it should
   * not suppress control-plane recovery operations that already run through
   * the strict critical-partition create lane.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldBypassConcurrentBudgetEmptyBackoff(normalizedMoveType, options = {}) {
    return shouldBypassConcurrentBudgetEmptyBackoff(
      this,
      normalizedMoveType,
      options,
    );
  }

  /**
   * Priority control-plane partitions must re-check authoritative in-flight
   * counts when cache-sourced budget admission is saturated.
   * Cache lag is expected during recovery and must not strand spread progress.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  resolveConcurrentBudgetReadMode(normalizedMoveType, options = {}) {
    return resolveConcurrentBudgetReadMode(this, normalizedMoveType, options);
  }

  /**
   * Priority control-plane spread must not stall behind unrelated add/replace
   * workflows. Keep priority add/replace operations on a dedicated count lane
   * while preserving the configured maxConcurrentAdds bound.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldUsePriorityConcurrentAddLane(normalizedMoveType, options = {}) {
    return shouldUsePriorityConcurrentAddLane(
      this,
      normalizedMoveType,
      options,
    );
  }

  /**
   * Publication and replica-operation partitions own the recovery surfaces
   * the rest of priority convergence depends on. Keep this emergency lane
   * narrower than the generic transport-critical classifier so transactional
   * priority tables do not consume the overflow slot when summary detail is
   * temporarily unavailable under load.
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isEmergencyPriorityControlPlanePartition(partitionId) {
    return isEmergencyPriorityControlPlanePartition(partitionId);
  }

  /**
   * Resolve the latest cluster publication row when available.
   * @return {Object|null}
   * @private
   */
  getLatestMembershipPublicationRow() {
    return getLatestMembershipPublicationRow(this);
  }

  /**
   * Priority recovery remains active while the latest membership publication
   * summary still reports unsatisfied spread. A short stale grace window keeps
   * recovery admission active when publication summary reads are transiently
   * unavailable under load.
   * @return {boolean}
   * @private
   */
  getPriorityRecoveryAdmissionPlan() {
    return getPriorityRecoveryAdmissionPlan(this);
  }

  isGlobalPriorityControlPlaneRecoveryActive() {
    return isGlobalPriorityControlPlaneRecoveryActive(this);
  }

  /**
   * Return true when emergency transport partitions are currently part of the
   * unresolved priority spread set. This keeps the emergency reservation
   * narrow: ordinary priority tables should not be hard-blocked at limit 1
   * when only ordinary priority partitions remain unresolved.
   *
   * Uses the same stale-grace semantics as global recovery activation so
   * transient summary read gaps do not flap reservation behavior.
   *
   * @return {boolean}
   * @private
   */
  isEmergencyPriorityControlPlaneRecoveryActive() {
    return isEmergencyPriorityControlPlaneRecoveryActive(this);
  }

  /**
   * Keep one shared add slot free for priority recovery while publication
   * spread remains unsatisfied.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getReservedPriorityRecoveryAddSlots(options = {}) {
    return getReservedPriorityRecoveryAddSlots(this, options);
  }

  /**
   * The number of plain-ADD budget slots held in fair-share reserve for genuine
   * runtime-service replica-creates (quest
   * formation-runtime-service-create-lane-budget-starvation).
   * @param {Object} [_options={}]
   * @return {number}
   * @private
   */
  getReservedCreateAddSlots(_options = {}) {
    return getReservedCreateAddSlots(this);
  }

  /**
   * Whether an admission is a genuine runtime-service replica-create (an ADD of
   * a runtime_service entity) that the reserved create slot protects.
   * @param {string} normalizedMoveType
   * @param {string} entityType
   * @return {boolean}
   * @private
   */
  isGenuineServiceCreateAdmission(normalizedMoveType, entityType) {
    return isGenuineServiceCreateAdmission(normalizedMoveType, entityType);
  }

  /**
   * Resolve the effective add budget for non-priority scheduling after
   * reserving capacity for priority recovery.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getConcurrentAddBudgetLimit(options = {}) {
    return getConcurrentAddBudgetLimit(this, options);
  }

  /**
   * Resolve the effective priority-lane add budget.
   * During active recovery, emergency transport partitions may use one extra
   * bounded emergency-owner slots above the ordinary priority limit, while
   * ordinary priority tables preserve those slots instead of consuming them
   * first.
   *
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getPriorityConcurrentAddBudgetLimit(options = {}) {
    return getPriorityConcurrentAddBudgetLimit(this, options);
  }
}

function applyRebalanceCoordinatorPriorityBudgetAdmissionMethods(targetClass) {
  const sourcePrototype =
    RebalanceCoordinatorPriorityBudgetAdmissionMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === 'constructor') {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyRebalanceCoordinatorPriorityBudgetAdmissionMethods};
