import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  countsTowardVoterTarget,
  occupiesNode,
} from './replica-inventory.js';
import {
  REPLICA_INVENTORY_CONSISTENCY,
  REPLICA_INVENTORY_OBSERVATION_STATE,
} from './replica-inventory-constants.js';
import {
  isEngagedLedgerQuorumSpreadCureMove,
} from './operation-ledger-hold-policy.js';
import {MOVE_REASON} from './rebalancer-constants.js';
import {
  isOperationLedgerPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  getStartupAuthorityControlPlanePlacementEligibleNodeIds,
} from '../control-plane/startup-authority-placement-eligibility.js';
import {
  evaluatePrioritySurplusRemovePlacementFence,
} from './priority-surplus-remove-placement-fence.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  OperationType,
  REBALANCER_SKIP_REASON,
  ReplicaStatus,
  SERVICE_TYPE,
  STORAGE_ADMISSION_DECISION_TYPE,
  SYSTEM_TABLE_NAME,
  TOPOLOGY_GUARD_DEFAULT_PARTITION_TARGET_REPLICA_COUNT,
  TOPOLOGY_GUARD_REASON,
  TOPOLOGY_GUARD_STATE,
  UNIFIED_SERVICE_TYPE,
} = REBALANCE_COORDINATOR_SHARED;

const LOCAL_STR_FUNCTION = 'function';
const TOPOLOGY_GUARD_ENTITY_TYPES = new Set([
  SERVICE_TYPE.PARTITION,
  SERVICE_TYPE.MESSAGE_GROUP,
  UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
]);
const TOPOLOGY_INCREASING_CREATE_OPERATION_TYPES = new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]);
const TOPOLOGY_GUARD_TARGET_COUNT_OPERATION_TYPES = new Set([
  OperationType.ADD,
]);
const TOPOLOGY_GUARD_ALLOWED_DECISION = Object.freeze({
  state: TOPOLOGY_GUARD_STATE.ALLOWED,
});
const EMPTY_STARTUP_AUTHORITY_PLACEMENT_NODE_IDS = Object.freeze([]);
const PRIORITY_SURPLUS_REMOVE_FENCE_REASON =
  'priority_surplus_remove_authority_unproven';

function captureInventoryCacheTableState(cache, tableName) {
  return {
    revision:
      typeof cache?.getAppliedSchemaVersion === LOCAL_STR_FUNCTION ?
        cache.getAppliedSchemaVersion(tableName) : null,
    lastAppliedAtMs:
      typeof cache?.getLastAppliedAtMs === LOCAL_STR_FUNCTION ?
        cache.getLastAppliedAtMs(tableName) : null,
    causeId:
      typeof cache?.getLastAppliedCauseId === LOCAL_STR_FUNCTION ?
        cache.getLastAppliedCauseId(tableName) : null,
  };
}

function captureInventoryCacheState(cache, capturedAtMs) {
  return {
    capturedAtMs,
    committedRows: captureInventoryCacheTableState(
      cache,
      SYSTEM_TABLE_NAME.SERVICES,
    ),
    inFlightOperations: captureInventoryCacheTableState(
      cache,
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    ),
  };
}

class RebalanceCoordinatorTopologyGuardMethods {
  getTopologyGuardStartupAuthorityPlacementEligibleNodeIds() {
    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      typeof readinessService.getStartupAuthoritySnapshotSync !==
        LOCAL_STR_FUNCTION
    ) {
      return EMPTY_STARTUP_AUTHORITY_PLACEMENT_NODE_IDS;
    }
    let startupAuthority;
    try {
      startupAuthority = readinessService.getStartupAuthoritySnapshotSync(
        this.nodeId,
        this.nowFn(),
      );
    } catch {
      return EMPTY_STARTUP_AUTHORITY_PLACEMENT_NODE_IDS;
    }
    return getStartupAuthorityControlPlanePlacementEligibleNodeIds({
      systemTableCache: this.systemTableCache,
      startupAuthority,
      messageRouter: this.messageRouter,
      localNodeId: this.nodeId,
      includeSelf: false,
    });
  }

  isTopologyGuardEntityType(entityType) {
    return TOPOLOGY_GUARD_ENTITY_TYPES.has(entityType);
  }

  isTopologyIncreasingCreateOperationType(normalizedMoveType) {
    return TOPOLOGY_INCREASING_CREATE_OPERATION_TYPES.has(normalizedMoveType);
  }

  isTopologyGuardTargetCountOperationType(normalizedMoveType) {
    return TOPOLOGY_GUARD_TARGET_COUNT_OPERATION_TYPES.has(
      normalizedMoveType,
    );
  }

  /**
   * The operation ledger cannot make its own authoritative services owner
   * readable until its concentrated quorum spreads. Permit only that
   * declared spread cures to use the conservative cache/operation union when
   * the services owner is unavailable. A REPLACE source must exist in actual
   * cache rows, an ADD must target the feasible missing node, operation
   * visibility must remain usable, and the ordinary occupied/target decisions
   * still run after this exception.
   * @param {Object} context
   * @param {Object} inventory
   * @param {Object} authoritativeObservation
   * @return {boolean}
   * @private
   */
  // Shared provenance precondition for BOTH conservative-union escapes:
  // the authoritative services owner is unavailable, the merged
  // cache/operation union is internally clean, and operation visibility is
  // still usable — the exact situation where fail-closed would otherwise
  // convert owner-unreachability into permanent denial of the cure.
  hasConservativeUnionInventoryProvenance(inventory, authoritativeObservation) {
    return !(
      authoritativeObservation?.available !== false ||
      inventory?.provenance?.consistency !==
        REPLICA_INVENTORY_CONSISTENCY.SOURCE_UNAVAILABLE ||
      inventory?.provenance?.committedRowsState !==
        REPLICA_INVENTORY_OBSERVATION_STATE.UNAVAILABLE ||
      [
        REPLICA_INVENTORY_OBSERVATION_STATE.UNAVAILABLE,
        REPLICA_INVENTORY_OBSERVATION_STATE.DEFERRED,
      ].includes(inventory?.provenance?.inFlightOperationsState) ||
      inventory?.anomalies?.length > 0
    );
  }

  // REPLACE escapes must prove their source against union ACTUALS: an
  // occupied ACTIVE/REMOVING voter row, never an inferred placement.
  resolveConservativeUnionReplaceSource(context, inventory) {
    const sourceReplicaId = String(context?.move?.replicaId || '').trim();
    const sourceReplica = inventory.replicas.find(
      (replica) => replica.replicaId === sourceReplicaId,
    );
    if (
      !sourceReplica?.voter ||
      ![
        ReplicaStatus.ACTIVE,
        ReplicaStatus.REMOVING,
      ].includes(sourceReplica?.status) ||
      !sourceReplica?.occupied
    ) {
      return null;
    }
    return sourceReplica;
  }

  isConcentratedLedgerRecoveryMove(
    context,
    inventory,
    authoritativeObservation,
  ) {
    const partitionId = String(context?.partitionId || '').trim();
    if (
      !this.hasConservativeUnionInventoryProvenance(
        inventory,
        authoritativeObservation,
      )
    ) {
      return false;
    }
    const isReplace = context?.normalizedMoveType === OperationType.REPLACE;
    let sourceReplica = null;
    if (isReplace) {
      sourceReplica = this.resolveConservativeUnionReplaceSource(
        context,
        inventory,
      );
      if (!sourceReplica) {
        return false;
      }
    }
    // Relation side (cure-typed move of a concentrated ledger partition whose
    // source sits on the hottest node) is an owner row; the provenance and
    // source-replica actuals above are this guard's own mechanism.
    return isEngagedLedgerQuorumSpreadCureMove({
      systemTableCache: this.systemTableCache,
      moveType: context?.normalizedMoveType,
      partitionId,
      placementEligibleNodeIds:
        this.getTopologyGuardStartupAuthorityPlacementEligibleNodeIds(),
      sourceReplicaNodeId: sourceReplica?.nodeId || null,
      targetNodeId: String(context?.move?.nodeId || '').trim(),
    });
  }

  /**
   * Conservative-union escape for PRIORITY control-plane spread cures — the
   * generalization of the ledger escape to the partitions the schema
   * admission gate waits on. Without it, an unavailable authoritative
   * services read blocks the only cure for critical_system_spread_open
   * while the gate keeps demanding it (the 2026-07-18T17:40 terminal
   * stall: sql_write_operations-p1 at [A,A,B] with free nodes, every
   * spread ADD denied replica_inventory_unusable for 3 minutes with a
   * frozen observation watermark). The union view must itself PROVE the
   * cure is needed and safe: distinct occupied nodes below the replica
   * target, an unoccupied target node, and no topology-increasing
   * operation already in flight. The occupied/target-count decision rows
   * still run after this escape, and counted distinct node ids include
   * in-flight targets, so the tick after one admitted cure re-blocks any
   * repeat — the run4 over-target invariant stays closed coordinator-side
   * while the planner-side guards (over-creation cap, spread-vs-count
   * reconcile, REPLACE serialization) are untouched upstream.
   * @param {Object} context
   * @param {Object} inventory
   * @param {Object} authoritativeObservation
   * @param {number|null} targetReplicaCount
   * @return {boolean}
   * @private
   */
  isEngagedPrioritySpreadCureMove(
    context,
    inventory,
    authoritativeObservation,
    targetReplicaCount,
  ) {
    const partitionId = String(context?.partitionId || '').trim();
    if (
      partitionId.length === 0 ||
      !Number.isFinite(targetReplicaCount) ||
      !this.hasConservativeUnionInventoryProvenance(
        inventory,
        authoritativeObservation,
      ) ||
      // The operation ledger keeps its own, stricter cure relation
      // (isConcentratedLedgerRecoveryMove); this escape covers the OTHER
      // priority control-plane partitions only.
      isOperationLedgerPartition({partitionId}) ||
      !this.isPriorityControlPlanePartition(partitionId)
    ) {
      return false;
    }
    const moveType = context?.normalizedMoveType;
    if (moveType === OperationType.ADD) {
      // The cure-typing rides as moveReason on coordinator operation
      // requests and as reason on planner move objects.
      const moveReason =
        context?.move?.moveReason ?? context?.move?.reason;
      if (moveReason !== MOVE_REASON.SPREAD_REPLICAS) {
        return false;
      }
    } else if (moveType === OperationType.REPLACE) {
      const sourceReplica = this.resolveConservativeUnionReplaceSource(
        context,
        inventory,
      );
      if (!sourceReplica) {
        return false;
      }
      // Only a REPLACE whose source sits on an over-represented node
      // (hosting more than one occupied replica in the union) restores
      // spread; relocating a lone replica keeps the distinct-node count
      // unchanged and must not ride the spread-cure escape.
      const sourceNodeOccupancy = inventory.replicas.filter(
        (replica) =>
          replica.occupied && replica.nodeId === sourceReplica.nodeId,
      ).length;
      if (sourceNodeOccupancy < 2) {
        return false;
      }
    } else {
      return false;
    }
    const targetNodeId = String(context?.move?.nodeId || '').trim();
    return (
      targetNodeId.length > 0 &&
      !occupiesNode(inventory, targetNodeId) &&
      inventory.occupiedNodeIds.length < targetReplicaCount &&
      // Only a CREATION-PHASE add-like operation proves topology increase is
      // already underway; the entity operation read carries no terminal
      // filter, so a completed ADD/REPLACE row lingering after its drain
      // (live 2026-07-19T07-22: ADD done 07:17:55, REMOVE done 07:18:57,
      // denials through 07:21:46) must not re-block the only cure. The
      // one-cure-per-tick re-block is preserved: an admitted cure's own
      // PENDING row is add-transitional and closes this row next tick.
      !inventory.operations.some((operation) =>
        TOPOLOGY_INCREASING_CREATE_OPERATION_TYPES.has(operation.type) &&
        operation.addTransitional)
    );
  }

  async resolveTopologyGuardTargetReplicaCount({partitionId, entityType}) {
    if (entityType !== SERVICE_TYPE.PARTITION) {
      return null;
    }
    let policy = null;
    try {
      if (
        this.tablePolicyService &&
        typeof this.tablePolicyService.getPolicyForPartition === LOCAL_STR_FUNCTION
      ) {
        policy =
          await this.tablePolicyService.getPolicyForPartition(partitionId);
      }
    } catch (_error) {
      policy = null;
    }
    const rawTargetReplicaCount = Number(
      policy?.targetReplicaCount || policy?.replicaCount,
    );
    if (
      Number.isFinite(rawTargetReplicaCount) &&
      rawTargetReplicaCount > 0
    ) {
      return Math.floor(rawTargetReplicaCount);
    }
    return TOPOLOGY_GUARD_DEFAULT_PARTITION_TARGET_REPLICA_COUNT;
  }

  async resolvePrioritySurplusRemoveFenceTargetReplicaCount({
    partitionId,
    entityType,
  }) {
    if (
      entityType !== SERVICE_TYPE.PARTITION ||
      typeof this.tablePolicyService?.getPolicyForPartition !==
        LOCAL_STR_FUNCTION
    ) {
      return null;
    }
    try {
      const policy =
        await this.tablePolicyService.getPolicyForPartition(partitionId);
      const targetReplicaCount = Number(
        policy?.targetReplicaCount ?? policy?.replicaCount,
      );
      return Number.isInteger(targetReplicaCount) && targetReplicaCount > 0 ?
        targetReplicaCount : null;
    } catch {
      return null;
    }
  }

  isPrioritySurplusRemovePlacementFenceApplicable(context) {
    const moveReason = context?.move?.moveReason ?? context?.move?.reason;
    return (
      context?.normalizedMoveType === OperationType.REMOVE &&
      moveReason !== MOVE_REASON.REPLICA_FAILED &&
      this.isPriorityControlPlanePartition(context?.partitionId)
    );
  }

  buildPrioritySurplusRemovePlacementFenceError(context, decision) {
    const reason = PRIORITY_SURPLUS_REMOVE_FENCE_REASON;
    const error = new Error(
      `Priority surplus REMOVE placement fence blocked ${String(
        context?.move?.replicaId || 'unknown',
      )} for ${String(context?.partitionId || 'unknown')}: ${decision.state}`,
    );
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.SAFETY_BLOCKED;
    error.admissionResult = Object.freeze({
      allowed: false,
      decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
      reason,
      blockingReasons: Object.freeze([
        Object.freeze({code: reason, state: decision.state}),
      ]),
      placementFenceDecision: decision,
    });
    return error;
  }

  /**
   * Revalidate a priority standalone REMOVE at the destructive commit boundary.
   * Cache-local placement may propose the move, but it cannot authorize it.
   *
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensurePrioritySurplusRemovePlacementFenceAllowed(context) {
    if (!this.isPrioritySurplusRemovePlacementFenceApplicable(context)) {
      return;
    }
    const targetReplicaCount =
      await this.resolvePrioritySurplusRemoveFenceTargetReplicaCount({
        partitionId: context.partitionId,
        entityType: context.entityType || SERVICE_TYPE.PARTITION,
      });
    let observation = Object.freeze({
      available: false,
      error: null,
      rows: Object.freeze([]),
      source: null,
    });
    if (targetReplicaCount !== null) {
      try {
        observation = await this.getAuthoritativeEntityServiceRowsObservation({
          partitionId: context.partitionId,
          entityType: context.entityType || SERVICE_TYPE.PARTITION,
          entityId: context.entityId || context.partitionId,
          readOptions: {
            authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
            allowSqlFallback: false,
            preferOwnerRpcReadLeader: true,
          },
        });
      } catch (error) {
        observation = Object.freeze({
          ...observation,
          error: error?.message || String(error),
        });
      }
    }
    const decision = evaluatePrioritySurplusRemovePlacementFence({
      observation,
      partitionId: context.partitionId,
      sourceReplicaId: context?.move?.replicaId,
      sourceNodeId: context?.move?.nodeId,
      targetReplicaCount,
      capturedAtMs: this.nowFn(),
    });
    if (decision.allowed === true) {
      return;
    }
    throw this.buildPrioritySurplusRemovePlacementFenceError(
      context,
      decision,
    );
  }

  /**
   * Build one blocked create-result payload when the canonical topology
   * snapshot proves an add-like move would violate one-node-per-replica or
   * exceed the steady-state distinct-node target.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async buildTopologyGuardSnapshot(context) {
    const normalizedMoveType = context?.normalizedMoveType || null;
    const entityType = context?.entityType || SERVICE_TYPE.PARTITION;
    const entityId = context?.entityId || context?.partitionId || null;
    const partitionId = context?.partitionId || entityId;
    const targetNodeId = String(context?.move?.nodeId || '').trim();
    if (
      !this.isTopologyGuardEntityType(entityType) ||
      !this.isTopologyIncreasingCreateOperationType(normalizedMoveType) ||
      context?.move?.enforceConcurrentOperationBudget !== true ||
      targetNodeId.length === 0
    ) {
      return Object.freeze({
        state: TOPOLOGY_GUARD_STATE.ALLOWED,
        admissionResult: null,
      });
    }

    const cacheStateBefore = captureInventoryCacheState(
      this.systemTableCache,
      this.nowFn(),
    );
    const cacheServiceRows = this.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
    const authoritativeObservation =
      await this.getAuthoritativeEntityServiceRowsObservation({
        partitionId,
        entityType,
        entityId,
      });
    const mergedServiceRows = this.mergeEntityServiceRows(
      cacheServiceRows,
      authoritativeObservation.rows,
    );
    const operationObservation =
      await this.getEntityTopologyInventoryOperationObservation(
        entityType,
        entityId,
      );
    const liveOperationRows = Array.isArray(operationObservation?.operations) ?
      operationObservation.operations : [];
    const cacheStateAfter = captureInventoryCacheState(
      this.systemTableCache,
      this.nowFn(),
    );
    const inventory = this.replicaInventoryBuilder({
      entityType,
      entityId,
      capturedAtMs: cacheStateAfter.capturedAtMs,
      committedRowsObservation: {
        state: authoritativeObservation.available === false ? 'unavailable' :
          mergedServiceRows.length > 0 ? 'present' : 'empty',
        rows: mergedServiceRows,
        revision: authoritativeObservation.snapshotVersion,
        revisionBefore: cacheStateBefore.committedRows.revision,
        revisionAfter: cacheStateAfter.committedRows.revision,
        watermarkBefore: cacheStateBefore.committedRows.lastAppliedAtMs,
        watermarkAfter: cacheStateAfter.committedRows.lastAppliedAtMs,
        causeId: cacheStateAfter.committedRows.causeId,
        // A local capture time is not a source observation time. In
        // particular, two successful sequential owner reads can be slow while
        // the operation ledger spreads; pairing the first read's local start
        // with the second read's local end fabricates cross-source skew and
        // circularly blocks the recovery REPLACE. Preserve null when the
        // source supplies no timestamp so the inventory reports
        // revision_unavailable without making an unsupported skew claim.
        observedAtMs: authoritativeObservation.observedAtMs,
      },
      inFlightOperationObservation: {
        state: operationObservation?.state || 'unavailable',
        operations: liveOperationRows,
        revisionBefore: cacheStateBefore.inFlightOperations.revision,
        revisionAfter: cacheStateAfter.inFlightOperations.revision,
        revision: cacheStateAfter.inFlightOperations.revision,
        watermarkBefore: cacheStateBefore.inFlightOperations.lastAppliedAtMs,
        watermarkAfter: cacheStateAfter.inFlightOperations.lastAppliedAtMs,
        causeId: cacheStateAfter.inFlightOperations.causeId,
        observedAtMs: cacheStateAfter.capturedAtMs,
      },
    });
    const observedDistinctNodeIds = inventory.occupiedNodeIds;
    const countedDistinctNodeIds = inventory.voterTargetNodeIds.filter(
      (nodeId) =>
        inventory.replicas.some((replica) =>
          replica.nodeId === nodeId &&
          countsTowardVoterTarget(inventory, replica.replicaId),
        ) ||
        inventory.operations.some((operation) =>
          operation.targetNodeId === nodeId &&
          (!operation.targetReplicaId ||
            countsTowardVoterTarget(
              inventory,
              operation.targetReplicaId,
            )),
        ),
    );
    const targetReplicaCount =
      await this.resolveTopologyGuardTargetReplicaCount({
        partitionId,
        entityType,
      });
    const concentratedLedgerRecoveryMove =
      this.isConcentratedLedgerRecoveryMove(
        context,
        inventory,
        authoritativeObservation,
      );
    const engagedPrioritySpreadCureMove =
      this.isEngagedPrioritySpreadCureMove(
        context,
        inventory,
        authoritativeObservation,
        targetReplicaCount,
      );
    const topologyGuardDecisionTable = Object.freeze([
      Object.freeze({
        matches:
          !inventory.provenance.topologyIncreaseUsable &&
          !concentratedLedgerRecoveryMove &&
          !engagedPrioritySpreadCureMove,
        state: TOPOLOGY_GUARD_STATE.INVENTORY_UNUSABLE,
        blockingReason: TOPOLOGY_GUARD_REASON.REPLICA_INVENTORY_UNUSABLE,
      }),
      Object.freeze({
        matches: occupiesNode(inventory, targetNodeId),
        state: TOPOLOGY_GUARD_STATE.TARGET_NODE_OCCUPIED,
        blockingReason: TOPOLOGY_GUARD_REASON.TARGET_NODE_ALREADY_OCCUPIED,
      }),
      Object.freeze({
        matches:
          this.isTopologyGuardTargetCountOperationType(normalizedMoveType) &&
          Number.isFinite(targetReplicaCount) &&
          countedDistinctNodeIds.length >= targetReplicaCount,
        state: TOPOLOGY_GUARD_STATE.TARGET_REPLICA_COUNT_SATISFIED,
        blockingReason:
          TOPOLOGY_GUARD_REASON.TARGET_REPLICA_COUNT_ALREADY_SATISFIED,
      }),
    ]);
    const topologyGuardDecision =
      topologyGuardDecisionTable.find((decision) => decision.matches) ||
      TOPOLOGY_GUARD_ALLOWED_DECISION;
    const state = topologyGuardDecision.state;

    if (state === TOPOLOGY_GUARD_STATE.ALLOWED) {
      return Object.freeze({
        state,
        admissionResult: null,
      });
    }

    const blockingReason = topologyGuardDecision.blockingReason;
    return Object.freeze({
      state,
      admissionResult: Object.freeze({
        allowed: false,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
        blockingReasons: Object.freeze([blockingReason]),
        eligibleNodeIds: Object.freeze([]),
        ineligibleNodes: Object.freeze([]),
        reason: blockingReason,
        topologySnapshot: Object.freeze({
          observedDistinctNodeIds: Object.freeze(observedDistinctNodeIds),
          observedDistinctNodeCount: observedDistinctNodeIds.length,
          observedServiceRowCount: inventory.replicas.length,
          targetNodeId,
          targetReplicaCount,
          authoritativeAvailable: authoritativeObservation.available === true,
          authoritativeReasonCode: authoritativeObservation.reasonCode || null,
          authoritativeRetryAfterMs:
            authoritativeObservation.retryAfterMs || null,
          inventoryProvenance: inventory.provenance,
          inventorySourceRevisions: inventory.sourceRevisions,
          inventorySourceWatermarks: inventory.sourceWatermarks,
        }),
      }),
    });
  }

  /**
   * Fail create-time add-like work closed when the canonical topology snapshot
   * already proves the target node is occupied or the steady-state target is
   * satisfied.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureCreateTopologyGuardAllowed(context) {
    const topologyGuard = await this.buildTopologyGuardSnapshot(context);
    if (topologyGuard.state === TOPOLOGY_GUARD_STATE.ALLOWED) {
      return;
    }
    throw this.createTopologyGuardAdmissionError(
      context?.move || null,
      topologyGuard.admissionResult,
    );
  }

  /**
   * Get in-flight operation rows for an entity.
   * @readModel COORDINATOR_ENTITY_IN_FLIGHT —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} params - Lookup parameters.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Array<Object>} Matching in-flight operations.
   * @private
   */
  getEntityInFlightOperationRows({entityType, entityId}) {
    return this.repository.getEntityInFlightOperationRows({
      entityType,
      entityId,
    });
  }

  /**
   * Read one replica_operations row from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {string} operationId
   * @return {Object|null}
   * @private
   */
  getReplicaOperationRowFromCache(operationId) {
    return this.repository.getReplicaOperationRowFromCache(operationId);
  }

  /**
   * Filter replica_operations rows from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {Function} predicate
   * @return {Object[]|null}
   * @private
   */
  filterReplicaOperationRowsFromCache(predicate) {
    return this.repository.filterReplicaOperationRowsFromCache(predicate);
  }

  /**
   * Return true when one operation can advance from observed replica
   * progress. Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isObservedProgressOperationCandidate(operation) {
    return this.workflowOwner.isObservedProgressOperationCandidate(operation);
  }

  /**
   * Filter candidate operation ids for one observed services row.
   * Delegates to workflow owner (D7.1).
   * @param {Object} serviceRow
   * @param {string} cacheOperation
   * @return {string[]}
   * @private
   */
  findObservedProgressOperationIds(serviceRow, cacheOperation) {
    return this.workflowOwner.findObservedProgressOperationIds(
      serviceRow,
      cacheOperation,
    );
  }

  /**
   * Reconcile one observed replica-progress event.
   * Delegates to workflow owner (D7.1).
   * @param {string} operationId
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileObservedProgressOperation(operationId) {
    return this.workflowOwner.reconcileObservedProgressOperation(operationId);
  }

  /**
   * Observe cache progress and re-enter the owner lane.
   * Delegates to workflow owner (D7.1).
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Object} record
   * @return {void}
   * @private
   */
  handleObservedReplicaStateChange(tableName, cacheOperation, record) {
    return this.workflowOwner.handleObservedReplicaStateChange(
      tableName,
      cacheOperation,
      record,
    );
  }

  /**
   * Resolve in-flight replica IDs for an entity from authoritative SQL.
   * Single read-model path — no cache fallback.
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} params - Lookup parameters.
   * @param {string} params.partitionId - Partition ID compatibility key.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Promise<Set<string>>} In-flight replica IDs.
   * @private
   */
  async getEntityInFlightReplicaIds({partitionId, entityType, entityId}) {
    return this.repository.getEntityInFlightReplicaIds({
      partitionId,
      entityType,
      entityId,
    });
  }
}

function applyRebalanceCoordinatorTopologyGuardMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorTopologyGuardMethods.prototype;
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

export {applyRebalanceCoordinatorTopologyGuardMethods};
