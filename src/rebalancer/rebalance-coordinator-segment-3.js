import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  applyRebalanceCoordinatorPriorityBudgetAdmissionMethods,
} from './rebalance-coordinator-priority-budget-admission.js';
import {RebalanceCoordinatorSegment2} from './rebalance-coordinator-segment-2.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_1CXMR = 'RebalanceCoordinator is shutting down';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_GWX6H = 'Failed to prime coordinator-created operation progress';

const {
  ControlPlaneReadinessService,
  NUM,
  OPERATION_METADATA_KEY,
  OperationType,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  ReplicaOperationField,
  SERVICE_TYPE,
  STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
  buildReplicatedServiceBootstrapTopology,
  createOperationRecord,
  uuidv4,
} = REBALANCE_COORDINATOR_SHARED;

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
}

applyRebalanceCoordinatorPriorityBudgetAdmissionMethods(
  RebalanceCoordinatorSegment3,
);

export {RebalanceCoordinatorSegment3};
