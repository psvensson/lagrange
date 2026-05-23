import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {RebalanceCoordinatorSegment2} from './rebalance-coordinator-segment-2.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_1CXMR = 'RebalanceCoordinator is shutting down';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_GWX6H = 'Failed to prime coordinator-created operation progress';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_CRITICAL_PARTITION = 'Critical partition ';
const LOCAL_STR_IN_FLIGHT = 'in flight';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_ADD = 'add';

const {
  CONCURRENT_CREATE_BUDGET_SCOPE,
  ControlPlaneReadinessService,
  NUM,
  OPERATION_METADATA_KEY,
  OperationType,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  ReplicaOperationField,
  SERVICE_TYPE,
  STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
  WORKFLOW_STEP,
  buildPriorityRecoveryOperationAssessment,
  buildReplicatedServiceBootstrapTopology,
  createOperationRecord,
  isPriorityRecoveryEmergencyPartition,
  isPriorityControlPlanePartitionTable,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
  uuidv4,
} = REBALANCE_COORDINATOR_SHARED;

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

class RebalanceCoordinatorSegment3 extends RebalanceCoordinatorSegment2 {
  assertMembershipPublicationEpoch(move) {
    const requestedEpoch = Number(move?.membershipPublicationEpoch);
    if (!Number.isInteger(requestedEpoch) || requestedEpoch < LOCAL_NUM_ZERO) {
      return;
    }

    const currentEpoch = this.getCurrentPublishedMembershipEpoch();
    if (!Number.isInteger(currentEpoch) || currentEpoch === requestedEpoch) {
      return;
    }

    const error = new Error(
      `Stale placement plan for published membership epoch ${requestedEpoch}; ` +
        `current epoch is ${currentEpoch}`,
    );
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_CHANGED;
    error.requestedMembershipPublicationEpoch = requestedEpoch;
    error.currentMembershipPublicationEpoch = currentEpoch;
    throw error;
  }

  /**
   * Create an operation record (persisted via SQL engine).
   * Includes deduplication check to prevent duplicate operations.
   * Requirements: 2.2, 2.3
   *
   * @param {Object} move - Move specification.
   * @param {string} move.type - Operation type: 'ADD', 'REMOVE', or 'REPLACE'.
   * @param {string} move.partitionId - Target partition ID.
   * @param {string} [move.entityType] - Entity type for canonical operations.
   * @param {string} [move.entityId] - Entity ID for canonical operations.
   * @param {string} move.nodeId - Target node ID.
   * @param {string} [move.replicaId] - Replica ID (for REMOVE operations).
   * @param {boolean} [move.emitOperationCreated] - Emit the local
   *   coordinator-created dispatch trigger after persistence.
   * @param {boolean} [move.skipProvisioningAdmissionRecheck] - Reuse an
   *   immediately preceding admitted provisioning probe for this target.
   * @return {Promise<Object>} Created or existing operation record.
   */
  async createOperation(move) {
    if (this.isShuttingDown || !this.initialized) {
      throw new Error(LOCAL_STR_1CXMR);
    }

    this.assertLocalControlPlaneMutationReady(move);

    const entityType = move.entityType || SERVICE_TYPE.PARTITION;
    const entityId = move.entityId || move.partitionId;
    const partitionId = move.partitionId || entityId;
    const normalizedMoveType = this.normalizeMoveType(move?.type);
    const shouldEmitOperationCreated = move?.emitOperationCreated !== false;
    const dedupeKey = this.buildOperationIntentKey(move, entityType, entityId);
    const criticalAddLikeIntentKey = this.buildCriticalAddLikeIntentKey(
      move,
      normalizedMoveType,
      partitionId,
      entityType,
      entityId,
    );
    const createOperationIntentKey = criticalAddLikeIntentKey || dedupeKey;
    const singleFlightKey = this.getCreateOperationSingleFlightKey(
      createOperationIntentKey,
    );
    this.pruneExpiredOperationIntents();

    const recentOperation = await this.getRecentOperationIntent(dedupeKey);
    if (recentOperation) {
      return this.maybeRearmReusedPendingOperation(recentOperation, {
        shouldEmitOperationCreated,
      });
    }
    if (criticalAddLikeIntentKey && criticalAddLikeIntentKey !== dedupeKey) {
      const recentCriticalOperation = await this.getRecentOperationIntent(
        criticalAddLikeIntentKey,
      );
      if (recentCriticalOperation) {
        this.rememberOperationIntents(
          [dedupeKey, criticalAddLikeIntentKey],
          recentCriticalOperation,
        );
        return this.maybeRearmReusedPendingOperation(recentCriticalOperation, {
          shouldEmitOperationCreated,
        });
      }
    }

    const existingPromise = this.operationsInCreation.get(singleFlightKey);
    if (existingPromise) {
      return existingPromise;
    }

    return this.operationWorkflowRunExclusive(singleFlightKey, () =>
      this.createOperationInternal(move),
    );
  }

  /**
   * Probe provisioning admission without persisting replica_operations rows.
   * Callers should use this before creating storage-increasing operations when
   * they need an all-or-nothing planning decision.
   *
   * @param {Object} move - Move specification.
   * @param {string} move.type - Operation type.
   * @param {string} move.partitionId - Target partition ID.
   * @param {string} [move.entityType] - Canonical entity type.
   * @param {string} [move.entityId] - Canonical entity ID.
   * @param {string} [move.nodeId] - Target node ID.
   * @param {string} [move.sourceNodeId] - Optional replace source node.
   * @return {Promise<Object>} Admission decision payload.
   */
  async checkProvisioningAdmission(move) {
    return this.provisioningAdmissionPolicy.checkProvisioningAdmission(move);
  }

  /**
   * Create an operation record after in-memory dedupe lock acquisition.
   * @param {Object} move - Move specification.
   * @return {Promise<Object>} Created or existing operation record.
   * @private
   */
  async createOperationInternal(move) {
    this.assertMembershipPublicationEpoch(move);

    const normalizedMoveType = this.normalizeMoveType(move?.type);
    const shouldEmitOperationCreated = move?.emitOperationCreated !== false;
    const entityType = move.entityType || SERVICE_TYPE.PARTITION;
    const entityId = move.entityId || move.partitionId;
    const partitionId = move.partitionId || entityId;
    const normalizedMove = normalizedMoveType ?
      {
        ...move,
        type: normalizedMoveType,
      } :
      move;
    const dedupeKey = this.buildOperationIntentKey(move, entityType, entityId);
    const criticalAddLikeIntentKey = this.buildCriticalAddLikeIntentKey(
      move,
      normalizedMoveType,
      partitionId,
      entityType,
      entityId,
    );
    const sourceNodeId =
      normalizedMoveType === OperationType.REPLACE ?
        move.sourceNodeId || this.nodeId :
        this.nodeId;
    const retiredSourceSafetyError =
      await this.getRetiredReplaceSourceMoveSafetyError(normalizedMove, {
        entityType,
        entityId,
      });
    if (retiredSourceSafetyError) {
      const error = new Error(retiredSourceSafetyError);
      error.rebalanceSkipReason = REBALANCER_SKIP_REASON.SAFETY_BLOCKED;
      throw error;
    }

    // Deduplication: check for existing in-flight operation
    const existing = await this.queryExistingInFlightOperation(
      partitionId,
      move.nodeId,
      entityType,
      entityId,
      normalizedMove,
      STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
    );

    if (existing) {
      this.rememberOperationIntents(
        [dedupeKey, criticalAddLikeIntentKey],
        existing,
      );
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.DUPLICATE_OPERATION, {
        existingOperationId: existing.operationId,
        partitionId: partitionId,
        targetNodeId: move.nodeId,
        type: normalizedMoveType || move.type,
        entityType: entityType,
        entityId: entityId,
      });
      return this.maybeRearmReusedPendingOperation(existing, {
        shouldEmitOperationCreated,
      });
    }

    if (criticalAddLikeIntentKey) {
      const recentCriticalOperation = await this.getRecentOperationIntent(
        criticalAddLikeIntentKey,
      );
      if (recentCriticalOperation) {
        this.rememberOperationIntents(
          [dedupeKey, criticalAddLikeIntentKey],
          recentCriticalOperation,
        );
        return this.maybeRearmReusedPendingOperation(recentCriticalOperation, {
          shouldEmitOperationCreated,
        });
      }
    }

    await this.ensureNoConflictingInFlightReplaceForRemove({
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    });
    await this.ensurePriorityControlPlaneRemoveLaneAvailable({
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    });
    await this.ensureEntityAddLikeCreateLaneAvailable({
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    });

    await this.ensureCriticalPartitionCreateLaneAvailable({
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    });
    await this.ensureCreateTopologyGuardAllowed({
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    });

    if (this.shouldEnforceConcurrentOperationBudget(move, normalizedMoveType)) {
      return this.runConcurrentCreateBudgetGate(
        normalizedMoveType,
        {
          partitionId,
          entityType,
          entityId,
        },
        async () =>
          this.createOperationRecordInternal({
            move,
            normalizedMove,
            normalizedMoveType,
            shouldEmitOperationCreated,
            entityType,
            entityId,
            partitionId,
            dedupeKey,
            criticalAddLikeIntentKey,
            sourceNodeId,
          }),
      );
    }

    return this.createOperationRecordInternal({
      move,
      normalizedMove,
      normalizedMoveType,
      shouldEmitOperationCreated,
      entityType,
      entityId,
      partitionId,
      dedupeKey,
      criticalAddLikeIntentKey,
      sourceNodeId,
    });
  }

  /**
   * Build canonical bootstrap topology for create dispatch.
   * Message-group operations fail closed when canonical topology is missing.
   * Partition operations derive topology when visible, but tolerate cache lag
   * so explicit bootstrap hints or local restore paths can still proceed.
   *
   * @param {Object} context
   * @return {{replicaIds: string[], peerAddresses: string[]}|null}
   * @private
   */
  buildOperationBootstrapTopology(context) {
    const {
      normalizedMoveType,
      entityType,
      entityId,
      excludeReplicaIds,
      partitionId,
      targetNodeId,
      targetReplicaId,
    } = context;

    if (
      (entityType !== SERVICE_TYPE.MESSAGE_GROUP &&
        entityType !== SERVICE_TYPE.PARTITION) ||
      (normalizedMoveType !== OperationType.ADD &&
        normalizedMoveType !== OperationType.REPLACE)
    ) {
      return null;
    }

    const serviceRows = this.repository.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
    if (!Array.isArray(serviceRows) || serviceRows.length === NUM.ZERO) {
      if (entityType === SERVICE_TYPE.PARTITION) {
        return null;
      }
      throw new Error(
        `Cannot create ${entityType} operation for ${entityId} without existing canonical topology`,
      );
    }

    const topology = buildReplicatedServiceBootstrapTopology({
      serviceType: entityType,
      serviceRows,
      excludeReplicaIds,
      targetReplicaId,
      targetNodeId,
    });
    const replicaIds = topology?.replicaIds || [];
    const peerAddresses = topology?.peerAddresses || [];

    if (
      replicaIds.length <= NUM.ONE ||
      peerAddresses.length < replicaIds.length
    ) {
      if (entityType === SERVICE_TYPE.PARTITION) {
        return null;
      }
      throw new Error(
        `Canonical topology for ${entityType} ${entityId} is incomplete`,
      );
    }

    return {
      replicaIds,
      peerAddresses,
    };
  }

  /**
   * Create and persist one operation after dedupe checks pass.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createOperationRecordInternal(context) {
    const {
      move,
      normalizedMove,
      normalizedMoveType,
      shouldEmitOperationCreated,
      entityType,
      entityId,
      partitionId,
      dedupeKey,
      criticalAddLikeIntentKey,
      sourceNodeId,
    } = context;

    const operationId = uuidv4();
    const sourceReplicaId =
      normalizedMoveType === OperationType.REPLACE ?
        move.replicaId || null :
        null;
    let operationReplicaId = move.replicaId || null;

    if (move?.skipProvisioningAdmissionRecheck !== true) {
      await this.ensureProvisioningAdmissionAllowed({
        move: normalizedMove,
        entityType,
        entityId,
        partitionId,
        sourceNodeId,
      });
    }

    if (normalizedMoveType === OperationType.ADD && !operationReplicaId) {
      operationReplicaId = await this.allocateCanonicalReplicaId({
        partitionId,
        entityType,
        entityId,
      });
    } else if (
      normalizedMoveType === OperationType.REPLACE &&
      (!operationReplicaId || operationReplicaId === sourceReplicaId)
    ) {
      operationReplicaId = await this.allocateCanonicalReplicaId({
        partitionId,
        entityType,
        entityId,
        excludeReplicaIds: sourceReplicaId ? [sourceReplicaId] : [],
      });
    }

    // Create operation using the helper from replica-status.js
    const operation = createOperationRecord({
      operationId,
      type: normalizedMoveType || move.type,
      partitionId: partitionId,
      sourceNodeId,
      targetNodeId: move.nodeId,
      replicaId: operationReplicaId,
      sourceReplicaId,
      membershipPublicationEpoch: move.membershipPublicationEpoch,
    });
    operation.entityType = entityType;
    operation.entityId = entityId;
    const bootstrapTopology = this.buildOperationBootstrapTopology({
      normalizedMoveType,
      entityType,
      entityId,
      excludeReplicaIds:
        normalizedMoveType === OperationType.REPLACE &&
        typeof sourceReplicaId === 'string' &&
        sourceReplicaId.length > NUM.ZERO ?
          [sourceReplicaId] :
          [],
      partitionId,
      targetNodeId: move.nodeId,
      targetReplicaId: operationReplicaId,
    });
    if (bootstrapTopology && operation.stepsHistory.length > NUM.ZERO) {
      operation[ReplicaOperationField.REPLICA_IDS] =
        bootstrapTopology.replicaIds;
      operation[ReplicaOperationField.PEER_ADDRESSES] =
        bootstrapTopology.peerAddresses;
      operation.stepsHistory[NUM.ZERO][OPERATION_METADATA_KEY.REPLICA_IDS] =
        bootstrapTopology.replicaIds;
      operation.stepsHistory[NUM.ZERO][OPERATION_METADATA_KEY.PEER_ADDRESSES] =
        bootstrapTopology.peerAddresses;
    }

    // Capture readiness snapshot for the target node at creation time
    // (Req 4.2 — persist readiness snapshot with decisions)
    const readinessDecisionDimension =
      this.resolveOperationReadinessDecisionDimension(partitionId);
    const targetReadiness =
      this.controlPlaneReadinessService.getNodeReadinessSync(move.nodeId, {
        decisionDimension: readinessDecisionDimension,
      });
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        readinessDecisionDimension,
      );
    if (readinessSnapshot && operation.stepsHistory.length > NUM.ZERO) {
      operation.stepsHistory[NUM.ZERO][
        OPERATION_METADATA_KEY.READINESS_SNAPSHOT
      ] = readinessSnapshot;
    }

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.CREATE_OPERATION, {
      operationId,
      type: normalizedMoveType || move.type,
      partitionId: partitionId,
      targetNodeId: move.nodeId,
      entityType: entityType,
      entityId: entityId,
    });

    // Persist via SQL engine (writes to partition leader)
    const inserted = await this.persistNewOperation(operation);
    if (!inserted) {
      const existingAfterInsert = await this.queryExistingInFlightOperation(
        partitionId,
        move.nodeId,
        entityType,
        entityId,
        normalizedMove,
        STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
      );
      if (existingAfterInsert) {
        this.rememberOperationIntents(
          [dedupeKey, criticalAddLikeIntentKey],
          existingAfterInsert,
        );
        return this.maybeRearmReusedPendingOperation(existingAfterInsert, {
          shouldEmitOperationCreated,
        });
      }
    }

    this.stats.operationsCreated++;
    this.rememberOperationIntents(
      [dedupeKey, criticalAddLikeIntentKey],
      operation,
    );

    // Create storage reservation atomically (Req 4.1)
    await this.createReservationForOperation(operation);

    if (shouldEmitOperationCreated) {
      this.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, {operation});
      await this.armCoordinatorCreatedOperationProgress(operation);
    }

    return operation;
  }

  /**
   * Newly created locally owned operations should not depend solely on cache
   * visibility or external listeners before leaving PENDING. Prime the
   * owner-side transition lane best-effort while keeping dispatch ownership on
   * the canonical event/read-model paths.
   *
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  async armCoordinatorCreatedOperationProgress(operation) {
    if (
      !operation?.operationId ||
      typeof this.workflowOwner?.armCoordinatorCreatedOperation !== LOCAL_STR_FUNCTION
    ) {
      return false;
    }
    try {
      return await this.workflowOwner.armCoordinatorCreatedOperation(operation);
    } catch (error) {
      this.logger.warn(
        LOCAL_STR_GWX6H,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId || null,
          workflowStep: operation.workflowStep || null,
          error: error?.message || String(error),
        },
      );
      return false;
    }
  }

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
      return;
    }

    throw this.createConcurrentOperationBudgetError(normalizedMoveType, LOCAL_NUM_ONE, {
      message:
        LOCAL_STR_CRITICAL_PARTITION +
        `${context.partitionId} already has an add-like operation ` +
        LOCAL_STR_IN_FLIGHT,
      conflictingOperationId: conflictingOperation.operationId,
    });
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
            NUM.ONE,
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
    if (replicaId.length === NUM.ZERO) {
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
      NUM.ONE,
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
    const scope = this.resolveConcurrentCreateBudgetScope(
      normalizedMoveType,
      budgetContext,
    );
    return this.operationWorkflowRunExclusive(
      this.getCreateBudgetSingleFlightKey(scope),
      async () => {
        await this.ensureConcurrentOperationBudgetAllowed(
          normalizedMoveType,
          budgetContext,
        );
        return executionFactory();
      },
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
    if (normalizedMoveType === OperationType.REMOVE) {
      return CONCURRENT_CREATE_BUDGET_SCOPE.REMOVE;
    }
    if (
      !this.shouldUsePriorityConcurrentAddLane(
        normalizedMoveType,
        budgetContext,
      )
    ) {
      return CONCURRENT_CREATE_BUDGET_SCOPE.ADD;
    }
    const priorityRecoveryAdmissionPlan =
      this.getPriorityRecoveryAdmissionPlan();
    if (
      priorityRecoveryAdmissionPlan.usesEmergencyPriorityOverflow(
        budgetContext?.partitionId,
      ) === true
    ) {
      return CONCURRENT_CREATE_BUDGET_SCOPE.EMERGENCY_PRIORITY_ADD;
    }
    return CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD;
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
    if (
      normalizedMoveType !== OperationType.ADD &&
      normalizedMoveType !== OperationType.REPLACE &&
      normalizedMoveType !== OperationType.REMOVE
    ) {
      return false;
    }
    const partitionId = String(options.partitionId || '').trim();
    if (partitionId.length === NUM.ZERO) {
      return false;
    }
    return this.isCriticalSystemPartition(partitionId);
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
    if (
      options.concurrentBudgetReadMode ===
      REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
    ) {
      return REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION;
    }
    if (
      normalizedMoveType !== OperationType.ADD &&
      normalizedMoveType !== OperationType.REPLACE &&
      normalizedMoveType !== OperationType.REMOVE
    ) {
      return REBALANCER_CONCURRENT_BUDGET_READ_MODE.CACHE_ONLY;
    }
    const partitionId = String(options.partitionId || '').trim();
    if (partitionId.length === NUM.ZERO) {
      return REBALANCER_CONCURRENT_BUDGET_READ_MODE.CACHE_ONLY;
    }
    return this.isPriorityControlPlanePartition(partitionId) ?
      REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION :
      REBALANCER_CONCURRENT_BUDGET_READ_MODE.CACHE_ONLY;
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
    if (
      normalizedMoveType !== OperationType.ADD &&
      normalizedMoveType !== OperationType.REPLACE
    ) {
      return false;
    }
    const partitionId = String(options.partitionId || '').trim();
    if (partitionId.length === NUM.ZERO) {
      return false;
    }
    return this.isPriorityControlPlanePartition(partitionId);
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
    return isPriorityRecoveryEmergencyPartition(partitionId);
  }

  /**
   * Resolve the latest cluster publication row when available.
   * @return {Object|null}
   * @private
   */
  getLatestMembershipPublicationRow() {
    const publicationService =
      this.controlPlaneReadinessService?.membershipPublicationService;
    let publicationRow = null;
    if (
      publicationService &&
      typeof publicationService.getLatestClusterPublicationSync === LOCAL_STR_FUNCTION
    ) {
      publicationRow = publicationService.getLatestClusterPublicationSync();
    } else if (
      publicationService &&
      typeof publicationService.getLatestPublicationRowSync === LOCAL_STR_FUNCTION
    ) {
      publicationRow = publicationService.getLatestPublicationRowSync();
    }
    return publicationRow && typeof publicationRow === LOCAL_STR_OBJECT ?
      publicationRow :
      null;
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
    return resolveTrackedPriorityRecoveryAdmissionPlan({
      tracker: this.priorityRecoveryAdmissionTracker,
      publicationRow: this.getLatestMembershipPublicationRow(),
      nowMs: this.nowFn(),
      staleGraceMs: this.priorityRecoveryActivityStaleGraceMs,
      maxConcurrentAdds: this.config.maxConcurrentAdds,
      isPriorityPartition: (partitionId) =>
        this.isPriorityControlPlanePartition(partitionId),
      isEmergencyPriorityPartition: (partitionId) =>
        this.isEmergencyPriorityControlPlanePartition(partitionId),
    });
  }

  isGlobalPriorityControlPlaneRecoveryActive() {
    return this.getPriorityRecoveryAdmissionPlan().recoveryActive === true;
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
    return (
      this.getPriorityRecoveryAdmissionPlan().emergencyRecoveryActive === true
    );
  }

  /**
   * Keep one shared add slot free for priority recovery while publication
   * spread remains unsatisfied.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getReservedPriorityRecoveryAddSlots(options = {}) {
    return this.getPriorityRecoveryAdmissionPlan().getReservedNonPrioritySlots(
      options.partitionId,
      LOCAL_STR_ADD,
    );
  }

  /**
   * Resolve the effective add budget for non-priority scheduling after
   * reserving capacity for priority recovery.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getConcurrentAddBudgetLimit(options = {}) {
    return Math.max(
      NUM.ZERO,
      this.config.maxConcurrentAdds -
        this.getReservedPriorityRecoveryAddSlots(options),
    );
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
    return this.getPriorityRecoveryAdmissionPlan().getPriorityAddBudgetLimit(
      options.partitionId,
    );
  }

  /**
   * Enforce configured maxConcurrentAdds/maxConcurrentRemoves before persisting
   * a newly scheduled operation.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {Promise<void>}
   * @private
   */
}

export {RebalanceCoordinatorSegment3};
