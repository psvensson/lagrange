import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  applyReplaceIntentIdentity,
  buildCoordinatorReplaceIntentIdentity,
  normalizeOperationPersistResult,
} from './rebalance-replace-intent-identity.js';
import {
  REPLICA_OPERATION_INSERT_DISPOSITION,
} from './replica-operation-insert-disposition.js';

const LOCAL_STR_REBALANCECOORDINATOR_IS_SHUTTING_DOWN = 'RebalanceCoordinator is shutting down';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_FAILED_TO_PRIME_COORDINATOR_CREATED_OPER = 'Failed to prime coordinator-created operation progress';

const {
  ControlPlaneReadinessService,
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

/**
 * Interlock-probe context for one prospective move (precheck side of
 * createOperationInternal's own interlock call).
 * @param {Object} move
 * @param {string|null} normalizedMoveType
 * @return {Object}
 */
function buildLedgerInterlockProbeContext(move, normalizedMoveType) {
  const entityId = move?.entityId || move?.partitionId;
  return {
    move,
    normalizedMoveType,
    entityType: move?.entityType || SERVICE_TYPE.PARTITION,
    entityId,
    partitionId: move?.partitionId || entityId,
  };
}

class RebalanceCoordinatorOperationCreation {
  assertMembershipPublicationEpoch(move) {
    const requestedEpoch = Number(move?.membershipPublicationEpoch);
    if (!Number.isInteger(requestedEpoch) || requestedEpoch < 0) {
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
   * @param {boolean} [move.deferDispatchUntilBootstrapTopology] - Persist the
   *   operation as non-dispatchable until its bootstrap cohort is complete.
   * @param {boolean} [move.skipProvisioningAdmissionRecheck] - Reuse an
   *   immediately preceding admitted provisioning probe for this target.
   * @return {Promise<Object>} Created or existing operation record.
   */
  async createOperation(move) {
    if (this.isShuttingDown || !this.initialized) {
      throw new Error(LOCAL_STR_REBALANCECOORDINATOR_IS_SHUTTING_DOWN);
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
    const replaceIntentIdentity = buildCoordinatorReplaceIntentIdentity({
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
      criticalAddLikeIntentKey,
    });
    const moveForCreate = applyReplaceIntentIdentity(
      move,
      replaceIntentIdentity,
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
      this.runOperationLedgerInterlockAccountedCreate(moveForCreate, () =>
        this.createOperationInternal(moveForCreate, {replaceIntentIdentity}),
      ),
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
    // The precheck must PREDICT createOperation's admission. The ledger
    // interlock rejects at CREATION time (createOperationInternal), and a
    // precheck that admits what creation then refuses turns whole-cluster
    // transient formation holds into instant client failures: run-24/25's
    // provisioning convergence wait polls THIS method, saw storage-only
    // admission, exited on the first probe, and every createOperation was
    // still interlock-deferred — the CREATE TABLE failed in one pass while
    // the hold would have cleared inside the provisioning budget.
    const ledgerInterlockDeferral =
      await this.resolveProvisioningLedgerInterlockDeferral(move);
    if (ledgerInterlockDeferral) {
      return ledgerInterlockDeferral;
    }
    return this.provisioningAdmissionPolicy.checkProvisioningAdmission(move);
  }

  /**
   * Probe the operation-ledger interlock for one prospective move; returns
   * the deferral decision when the interlock would refuse creation, null
   * when creation is clear to proceed.
   * @param {Object} move - Move specification.
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveProvisioningLedgerInterlockDeferral(move) {
    try {
      await this.ensureOperationLedgerSelfMoveSerialized(
        buildLedgerInterlockProbeContext(move, this.normalizeMoveType(move?.type)),
      );
    } catch (error) {
      const admissionResult = error?.admissionResult;
      if (!admissionResult) {
        // The precheck is ADVISORY: an unreadable ledger must not turn a
        // probe into a provisioning abort (absence of actuals never blocks
        // routine admission). Creation remains the enforcer.
        this.logger?.debug?.(
          REBALANCE_COORDINATOR_LOG_MSG.PROVISIONING_ADMISSION_DENIED,
          {probeError: error?.message || String(error)},
        );
        return null;
      }
      return {
        allowed: false,
        decisionType: admissionResult.decisionType || null,
        admissionResult,
        error,
      };
    }
    return null;
  }

  /**
   * Create an operation record after in-memory dedupe lock acquisition.
   * @param {Object} move - Move specification.
   * @return {Promise<Object>} Created or existing operation record.
   * @private
   */
  async createOperationInternal(move, creationContext = {}) {
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

    await this.ensureOperationLedgerSelfMoveSerialized({
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    });
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
    await this.ensurePrioritySurplusRemovePlacementFenceAllowed({
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
            replaceIntentIdentity: creationContext.replaceIntentIdentity,
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
      replaceIntentIdentity: creationContext.replaceIntentIdentity,
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
    if (!Array.isArray(serviceRows) || serviceRows.length === 0) {
      if (entityType === SERVICE_TYPE.PARTITION) {
        // CL-013: a silently-unstamped operation forces the target replica
        // onto its local cache fallback — make the tolerated null loud.
        this.logger.warn(
          REBALANCE_COORDINATOR_LOG_MSG.BOOTSTRAP_TOPOLOGY_UNRESOLVED,
          {
            partitionId,
            entityType,
            entityId,
            reason: 'no_service_rows',
          },
        );
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
      replicaIds.length <= 1 ||
      peerAddresses.length < replicaIds.length
    ) {
      if (entityType === SERVICE_TYPE.PARTITION) {
        // CL-013: see above — never drop topology silently.
        this.logger.warn(
          REBALANCE_COORDINATOR_LOG_MSG.BOOTSTRAP_TOPOLOGY_UNRESOLVED,
          {
            partitionId,
            entityType,
            entityId,
            reason: 'incomplete_topology',
            replicaIdCount: replicaIds.length,
            peerAddressCount: peerAddresses.length,
          },
        );
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
   * Resolve the authoritative operation that won a persistence collision.
   * Deterministic intent IDs take precedence over the broader in-flight key.
   *
   * @param {Object} context
   * @return {Promise<Object|null>}
   * @private
   */
  async queryExistingOperationAfterInsertConflict(context) {
    const {
      operationIntentId,
      operationId,
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      normalizedMove,
    } = context;

    if (operationIntentId) {
      const existingByDeterministicId =
        await this.repository.queryAuthoritativeOperationById(operationId);
      if (existingByDeterministicId) {
        return existingByDeterministicId;
      }
    }

    return this.queryExistingInFlightOperation(
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      normalizedMove,
      STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
    );
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

    const operationId = move.operationIntentId || uuidv4();
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
      operationReplicaId = move.replicaIntentId ||
        await this.allocateCanonicalReplicaId({
          partitionId,
          entityType,
          entityId,
        });
    } else if (
      normalizedMoveType === OperationType.REPLACE &&
      (!operationReplicaId || operationReplicaId === sourceReplicaId)
    ) {
      operationReplicaId = move.replicaIntentId ||
        await this.allocateCanonicalReplicaId({
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
    if (
      move?.deferDispatchUntilBootstrapTopology === true &&
      operation.stepsHistory.length > 0
    ) {
      operation.stepsHistory[0][
        OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED
      ] = true;
    }
    const bootstrapTopology = this.buildOperationBootstrapTopology({
      normalizedMoveType,
      entityType,
      entityId,
      excludeReplicaIds:
        normalizedMoveType === OperationType.REPLACE &&
        typeof sourceReplicaId === 'string' &&
        sourceReplicaId.length > 0 ?
          [sourceReplicaId] :
          [],
      partitionId,
      targetNodeId: move.nodeId,
      targetReplicaId: operationReplicaId,
    });
    if (bootstrapTopology && operation.stepsHistory.length > 0) {
      operation[ReplicaOperationField.REPLICA_IDS] =
        bootstrapTopology.replicaIds;
      operation[ReplicaOperationField.PEER_ADDRESSES] =
        bootstrapTopology.peerAddresses;
      operation.stepsHistory[0][OPERATION_METADATA_KEY.REPLICA_IDS] =
        bootstrapTopology.replicaIds;
      operation.stepsHistory[0][OPERATION_METADATA_KEY.PEER_ADDRESSES] =
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
    if (readinessSnapshot && operation.stepsHistory.length > 0) {
      operation.stepsHistory[0][
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
      bootstrapTopologyStamped: bootstrapTopology !== null,
      bootstrapReplicaIdCount: bootstrapTopology ?
        bootstrapTopology.replicaIds.length :
        0,
    });

    // Persist via SQL engine (writes to partition leader)
    const persistResult = normalizeOperationPersistResult(
      await this.persistNewOperation(
        operation,
        context.replaceIntentIdentity ? {returnDisposition: true} : undefined,
      ),
    );
    if (
      persistResult.disposition ===
      REPLICA_OPERATION_INSERT_DISPOSITION.EXISTING
    ) {
      return this.resolveCreatedOperationPersistenceCollision({
        ...context,
        operation,
        persistResult,
      });
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
        LOCAL_STR_FAILED_TO_PRIME_COORDINATOR_CREATED_OPER,
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

function applyRebalanceCoordinatorOperationCreationMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorOperationCreation.prototype;
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

export {applyRebalanceCoordinatorOperationCreationMethods};
