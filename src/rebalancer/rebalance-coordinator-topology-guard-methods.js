import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  readPolicyForPartition,
  requirePolicyTargetReplicaCount,
} from '../policy/table-policy-resolution.js';
import {
  countsTowardVoterTarget,
  occupiesNode,
} from './replica-inventory.js';
import {REPLICA_INVENTORY_OBSERVATION_STATE} from './replica-inventory-constants.js';
import {MOVE_REASON} from './rebalancer-constants.js';
import {ownerFactEntityServiceRows} from './entity-service-row-read.js';
import {OWNER_FACT_STATE} from '../control-plane/control-plane-owner-fact-read.js';
import {OWNER_CONTRACT_NEXT_ACTION} from '../control-plane/owner-contract-outcome.js';
import {
  evaluatePrioritySurplusRemovePlacementFence,
} from './priority-surplus-remove-placement-fence.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  OperationType,
  REBALANCER_SKIP_REASON,
  SERVICE_TYPE,
  STORAGE_ADMISSION_DECISION_TYPE,
  SYSTEM_TABLE_NAME,
  TOPOLOGY_GUARD_REASON,
  TOPOLOGY_GUARD_STATE,
  UNIFIED_SERVICE_TYPE,
  classifySystemPartition,
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

  async resolveTopologyGuardTargetReplicaCount({
    partitionId,
    entityType,
    requireAuthoritative = false,
  }) {
    if (entityType !== SERVICE_TYPE.PARTITION) {
      return null;
    }
    try {
      const policy = await readPolicyForPartition(
        this.tablePolicyService,
        partitionId,
        requireAuthoritative ? {requireAuthoritative: true} : undefined,
      );
      return requirePolicyTargetReplicaCount(policy);
    } catch {
      return null;
    }
  }

  async resolvePrioritySurplusRemoveFenceTargetReplicaCount({
    partitionId,
    entityType,
  }) {
    return this.resolveTopologyGuardTargetReplicaCount({
      partitionId,
      entityType,
      requireAuthoritative: true,
    });
  }

  isPrioritySurplusRemovePlacementFenceApplicable(context) {
    const moveReason = context?.move?.moveReason ?? context?.move?.reason;
    return (
      context?.normalizedMoveType === OperationType.REMOVE &&
      moveReason !== MOVE_REASON.REPLICA_FAILED &&
      classifySystemPartition({partitionId: context?.partitionId})
        .priorityControlPlane
    );
  }

  buildPrioritySurplusRemovePlacementFenceError(context, decision) {
    const reason = PRIORITY_SURPLUS_REMOVE_FENCE_REASON;
    const replicaId = String(context?.move?.replicaId || 'unknown');
    const partitionId = String(context?.partitionId || 'unknown');
    const error = new Error(
      `Priority surplus REMOVE placement fence blocked ${replicaId} for ${partitionId}: ${decision.state}`,
    );
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.SAFETY_BLOCKED;
    error.admissionResult = Object.freeze({
      allowed: false,
      decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
      reason,
      blockingReasons: Object.freeze([Object.freeze({code: reason, state: decision.state})]),
      placementFenceDecision: decision,
    });
    return error;
  }

  async ensurePrioritySurplusRemovePlacementFenceAllowed(context) {
    if (!this.isPrioritySurplusRemovePlacementFenceApplicable(context)) return;
    const entityType = context.entityType || SERVICE_TYPE.PARTITION;
    const targetReplicaCount =
      await this.resolvePrioritySurplusRemoveFenceTargetReplicaCount({
        partitionId: context.partitionId,
        entityType,
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
          entityType,
          entityId: context.entityId || context.partitionId,
          readOptions: {
            authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
            leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
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
    if (decision.allowed !== true) {
      throw this.buildPrioritySurplusRemovePlacementFenceError(context, decision);
    }
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
    const cacheOperationRowsBefore = this.getEntityInFlightOperationRows({
      entityType,
      entityId,
    });
    const identity = {entityType, entityId};
    const inventoryFact = await this.readEntityServiceOwnerFact(identity);
    if (inventoryFact.state !== OWNER_FACT_STATE.READY) {
      return this.buildTopologyGuardUnavailableDecision(inventoryFact, targetNodeId);
    }
    // The owner's rows, with the node's projection only ever adding an
    // occupant (it can refuse more, never admit more).
    const mergedServiceRows = this.mergeEntityServiceRows(
      cacheServiceRows,
      ownerFactEntityServiceRows(inventoryFact, identity),
    );
    const operationObservation =
      await this.getEntityRecoveryOperationObservation(
        entityType,
        entityId,
      );
    const cacheStateAfterRaw = captureInventoryCacheState(
      this.systemTableCache,
      this.nowFn(),
    );
    const cacheServiceRowsAfter = this.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
    const cacheOperationRowsAfter = this.getEntityInFlightOperationRows({
      entityType,
      entityId,
    });
    const cacheStateAfter = {
      capturedAtMs: cacheStateAfterRaw.capturedAtMs,
      committedRows:
        JSON.stringify(cacheServiceRows) ===
        JSON.stringify(cacheServiceRowsAfter) ?
          cacheStateBefore.committedRows :
          cacheStateAfterRaw.committedRows,
      inFlightOperations:
        JSON.stringify(cacheOperationRowsBefore) ===
        JSON.stringify(cacheOperationRowsAfter) ?
          cacheStateBefore.inFlightOperations :
          cacheStateAfterRaw.inFlightOperations,
    };
    const inventory = this.replicaInventoryBuilder({
      entityType,
      entityId,
      capturedAtMs: cacheStateAfter.capturedAtMs,
      committedRowsObservation: {
        state: mergedServiceRows.length > 0 ?
          REPLICA_INVENTORY_OBSERVATION_STATE.PRESENT :
          REPLICA_INVENTORY_OBSERVATION_STATE.EMPTY,
        rows: mergedServiceRows,
        revision: null,
        revisionBefore: cacheStateBefore.committedRows.revision,
        revisionAfter: cacheStateAfter.committedRows.revision,
        watermarkBefore: cacheStateBefore.committedRows.lastAppliedAtMs,
        watermarkAfter: cacheStateAfter.committedRows.lastAppliedAtMs,
        causeId: cacheStateAfter.committedRows.causeId,
        // A local capture time is not a source observation time, and the
        // owner fact's witness time is the serving node's clock: neither is
        // comparable with the operation capture, so no skew is claimed and
        // the inventory reports revision_unavailable.
        observedAtMs: null,
      },
      inFlightOperationObservation: {
        ...operationObservation,
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
    const topologyGuardDecisionTable = Object.freeze([
      Object.freeze({
        matches: entityType === SERVICE_TYPE.PARTITION && targetReplicaCount === null,
        state: TOPOLOGY_GUARD_STATE.TARGET_UNAVAILABLE,
        blockingReason: TOPOLOGY_GUARD_REASON.PARTITION_TARGET_UNAVAILABLE,
      }),
      Object.freeze({
        matches: !inventory.provenance.topologyIncreaseUsable,
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
          authoritativeAvailable: true,
          authoritativeReasonCode: null,
          authoritativeRetryAfterMs: null,
          inventoryProvenance: inventory.provenance,
          inventorySourceRevisions: inventory.sourceRevisions,
          inventorySourceWatermarks: inventory.sourceWatermarks,
        }),
      }),
    });
  }

  /**
   * No decision: the SERVICES owner fact is UNAVAILABLE. A deferral naming
   * the read's reason, with the retry its caller's scheduled turn makes;
   * never the "read and unusable" refusal below.
   * @param {Object} fact - The UNAVAILABLE owner fact.
   * @param {string} targetNodeId
   * @return {Object} The guard's deferred decision.
   * @private
   */
  buildTopologyGuardUnavailableDecision(fact, targetNodeId) {
    const reason = TOPOLOGY_GUARD_REASON.REPLICA_INVENTORY_UNAVAILABLE;
    const retryAfterMs = Number.isSafeInteger(fact.retryAfterMs) ? fact.retryAfterMs : null;
    return Object.freeze({
      state: TOPOLOGY_GUARD_STATE.INVENTORY_UNAVAILABLE,
      admissionResult: Object.freeze({
        allowed: false,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
        blockingReasons: Object.freeze([reason]),
        eligibleNodeIds: Object.freeze([]),
        ineligibleNodes: Object.freeze([]),
        reason,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
        topologySnapshot: Object.freeze({
          targetNodeId,
          authoritativeAvailable: false,
          authoritativeReasonCode: fact.reason,
          authoritativeRetryAfterMs: retryAfterMs,
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
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Promise<Set<string>>} In-flight replica IDs.
   * @private
   */
  async getEntityInFlightReplicaIds({entityType, entityId}) {
    return this.repository.getEntityInFlightReplicaIds({
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
