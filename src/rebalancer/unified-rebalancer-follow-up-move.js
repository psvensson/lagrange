import {UnifiedRebalancerFollowUpDecision} from './unified-rebalancer-follow-up-decision.js';
import {
  applyUnifiedRebalancerFollowUpAugmentationMethods,
} from './unified-rebalancer-follow-up-augmentation-methods.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';
import {
  REPLICA_INVENTORY_OBSERVATION_STATE,
} from './replica-inventory-constants.js';
import {inFlightAddInfluenceCount} from './replica-inventory.js';
import {
  PLACEMENT_CURE_CONDITION,
  classifyPriorityRecoveryFollowUpCureCondition,
  resolvePlacementCure,
} from './replica-placement-cure-policy.js';
import {
  CONTROL_PLANE_MUTATION_PRIORITY_RECOVERY_AUTHORITY_FIELD,
} from '../control-plane/control-plane-mutation-readiness.js';
const {
  EntityType,
  PRIORITY_RECOVERY_FOLLOW_UP_FIELD,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  REBALANCER_ERROR_MSG,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_FIELD,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  REBALANCER_TARGET_READINESS_MODE,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
} = SHARED;
const {
  CONTROL_PLANE_READINESS_DIMENSION,
  NodeStatus,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
} = SHARED.UNIFIED_REBALANCER_SHARED;
const PRIORITY_RECOVERY_FOLLOW_UP_TARGET_STATE_FIELD = Object.freeze({
  TARGET_NODES: 'targetNodes',
  TARGET_NODE_ID_SNAKE: 'target_node_id',
});
const PRIORITY_RECOVERY_SERIAL_WAIT_FIELDS = Object.freeze([
  PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_OPERATION_IDS,
  PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_PARTITION_IDS,
]);
function readFollowUpText(record, ...fieldNames) {
  const fieldName = fieldNames.find((name) => record?.[name]);
  return String(fieldName ? record[fieldName] : '').trim();
}
function readFollowUpNodeId(record) {
  return readFollowUpText(
    record,
    PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID,
    PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL,
  );
}
function readFollowUpOperationPartitionId(operation) {
  return readFollowUpText(
    operation,
    PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID,
    PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE,
    PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ENTITY_ID,
  );
}

function readFollowUpOperationTargetNodeId(operation) {
  return readFollowUpText(
    operation,
    PRIORITY_RECOVERY_FOLLOW_UP_TARGET_STATE_FIELD.TARGET_NODE_ID_SNAKE,
    PRIORITY_RECOVERY_FOLLOW_UP_FIELD.TARGET_NODE_ID,
  );
}

function buildPriorityRecoveryMoveFields({
  cure,
  partitionId,
  targetNodeId,
  sourceNodeId = '',
  replicaId = '',
  serialWaitMoveFields,
}) {
  return Object.freeze({
    type: cure.moveType,
    partitionId,
    entityType: EntityType.PARTITION,
    entityId: partitionId,
    nodeId: targetNodeId,
    reason: cure.moveReason,
    controlPlaneMutationWorkClass: UNIFIED_REBALANCER_LITERAL.BACKGROUND,
    [CONTROL_PLANE_MUTATION_PRIORITY_RECOVERY_AUTHORITY_FIELD]: true,
    ...serialWaitMoveFields,
    ...(sourceNodeId ? {sourceNodeId, replicaId} : {}),
    [REBALANCER_MOVE_FIELD.TARGET_READINESS_MODE]:
      REBALANCER_TARGET_READINESS_MODE.DEFER_TO_WORKFLOW_OWNER,
  });
}

function isFollowUpNodeExcluded(nodeId, excludedNodeIdSets) {
  return excludedNodeIdSets.some((nodeIds) => nodeIds.has(nodeId));
}

function resolveFollowUpInventory(
  rebalancer,
  {
    inventory,
    targetStateInventory,
    partitionId,
    currentReplicas,
    ownerOperationObservation = null,
  },
) {
  if (inventory) {
    return inventory;
  }
  const targetStateIsReusable =
    !ownerOperationObservation &&
    targetStateInventory?.entityId === partitionId;
  if (targetStateIsReusable) {
    return targetStateInventory;
  }
  return rebalancer.buildPriorityRecoveryFollowUpInventory(
    currentReplicas,
    partitionId,
    ownerOperationObservation,
  );
}
function readPreviousFailedTargetNodeId(decision) {
  return readFollowUpText(
    decision?.decisionSnapshot?.coordinator?.operation,
    PRIORITY_RECOVERY_FOLLOW_UP_FIELD.TARGET_NODE_ID,
  );
}
function readFollowUpTargetReadiness(rebalancer, nodeId) {
  const readinessService = rebalancer.controlPlaneReadinessService;
  if (
    nodeId.length === 0 ||
    typeof readinessService?.getNodeReadinessSync !== 'function'
  ) {
    return null;
  }
  return readinessService.getNodeReadinessSync(
    nodeId,
    {allowStaleOnCacheChange: false},
  );
}

function copyFrozenArrayFields(record, fieldNames) {
  const fields = {};
  for (const fieldName of fieldNames) {
    if (Array.isArray(record?.[fieldName])) {
      fields[fieldName] = Object.freeze([...record[fieldName]]);
    }
  }
  return Object.freeze(fields);
}
function isEligibleFollowUpTarget(rebalancer, nodeId, excludedNodeIdSets) {
  return !isFollowUpNodeExcluded(nodeId, excludedNodeIdSets) &&
    !rebalancer.isPriorityRecoveryFollowUpTargetKnownLocallyNotReady(nodeId);
}

function selectFollowUpTargetNodeId(
  rebalancer,
  eligibleNodeIds,
  {
    healthyNodeIds,
    occupiedNodeIds,
    pendingTargetNodeIds,
    crossPartitionPendingTargetNodeIds,
    previousFailedTargetNodeId,
  },
) {
  const excludedNodeIdSets = [
    healthyNodeIds,
    occupiedNodeIds,
    pendingTargetNodeIds,
    crossPartitionPendingTargetNodeIds,
  ];
  const unusedNodeIds = eligibleNodeIds.filter(
    (nodeId) => isEligibleFollowUpTarget(
      rebalancer,
      nodeId,
      excludedNodeIdSets,
    ),
  );
  return unusedNodeIds.find(
    (nodeId) => nodeId !== previousFailedTargetNodeId,
  ) || unusedNodeIds[0] || eligibleNodeIds.find(
    (nodeId) => isEligibleFollowUpTarget(
      rebalancer,
      nodeId,
      [occupiedNodeIds, pendingTargetNodeIds],
    ),
  ) || null;
}

function buildCreatedFollowUpMove(rebalancer, context) {
  const {
    state = PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.MOVE_CREATED,
    outcomeReason,
    cureCondition,
  } = context;
  return rebalancer.buildPriorityRecoveryFollowUpMoveOutcome(
    state,
    outcomeReason,
    buildPriorityRecoveryMoveFields({
      ...context,
      cure: resolvePlacementCure(cureCondition),
    }),
  );
}

function buildDeficitFollowUpMove(rebalancer, context) {
  const {
    currentReplicas,
    healthyReplicas,
    inventory,
    partitionId,
    targetReplicaCount,
  } = context;
  const occupiedReplicaCount =
    rebalancer.getReadyNodeOccupiedReplicas(currentReplicas).length;
  if (
    healthyReplicas.length < targetReplicaCount &&
    rebalancer.isPriorityRecoveryFollowUpDeficitSatisfiedByInFlightAdds(
      partitionId,
      occupiedReplicaCount,
      targetReplicaCount,
      inventory,
    )
  ) {
    return rebalancer.buildPriorityRecoveryFollowUpMoveOutcome(
      PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.IN_FLIGHT_ADD_SATISFIES_DEFICIT,
      PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.IN_FLIGHT_ADD_SATISFIES_DEFICIT,
    );
  }
  return buildCreatedFollowUpMove(rebalancer, {
    ...context,
    outcomeReason:
      PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.ADD_FOLLOW_UP_CREATED,
    cureCondition: PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION,
  });
}
function readFollowUpSourceIds(sourceReplica) {
  return {
    sourceNodeId: readFollowUpNodeId(sourceReplica),
    replicaId: readFollowUpText(
      sourceReplica,
      PRIORITY_RECOVERY_FOLLOW_UP_FIELD.REPLICA_ID,
      PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERVICE_ID,
    ),
  };
}

function buildRelocationFollowUpMove(rebalancer, context) {
  const sourceIds = readFollowUpSourceIds(context.sourceReplica);
  if (!sourceIds.sourceNodeId || !sourceIds.replicaId) {
    return buildCreatedFollowUpMove(rebalancer, {
      ...context,
      state:
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.SOURCE_FALLBACK_ADD_CREATED,
      outcomeReason: PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.SOURCE_UNAVAILABLE,
      cureCondition: PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION,
    });
  }
  return buildCreatedFollowUpMove(rebalancer, {
    ...context,
    ...sourceIds,
    outcomeReason:
      PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.REPLACE_FOLLOW_UP_CREATED,
  });
}

class UnifiedRebalancerFollowUpMove extends UnifiedRebalancerFollowUpDecision {
  buildPriorityRecoveryFollowUpInventory(
    currentReplicas = [],
    partitionId = '',
    ownerOperationObservation = null,
  ) {
    const resolvedPartitionId = partitionId || this.entityId;
    const crossPartition = resolvedPartitionId !== this.entityId;
    const rawOperations = (crossPartition ?
      this.getGlobalTopologyBlockingInFlightOperations() :
      this.getTopologyBlockingInFlightOperations()).filter((operation) => {
      const operationPartitionId =
        readFollowUpOperationPartitionId(operation);
      return operationPartitionId.length === 0 ||
        operationPartitionId === resolvedPartitionId;
    });
    const operations = ownerOperationObservation?.operations || rawOperations;
    const capturedAtMs = this.nowFn();
    return this.replicaInventoryBuilder({
      entityType: EntityType.PARTITION,
      entityId: resolvedPartitionId,
      capturedAtMs,
      committedRowsObservation: {
        state: currentReplicas.length > 0 ?
          REPLICA_INVENTORY_OBSERVATION_STATE.PRESENT :
          REPLICA_INVENTORY_OBSERVATION_STATE.EMPTY,
        rows: currentReplicas,
        observedAtMs: capturedAtMs,
      },
      inFlightOperationObservation: {
        state: ownerOperationObservation?.state ||
          (operations.length > 0 ?
            REPLICA_INVENTORY_OBSERVATION_STATE.PRESENT :
            REPLICA_INVENTORY_OBSERVATION_STATE.EMPTY),
        operations,
        observedAtMs: capturedAtMs,
      },
    });
  }

  resolvePriorityRecoveryFollowUpOwnerOperationObservation(decision = null) {
    const semanticState =
      decision?.decisionSnapshot?.semanticState ||
      decision?.decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SEMANTIC_STATE_ID
      ];
    if (semanticState !== PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION) {
      return null;
    }
    const ownerVisibilityState =
      decision?.decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.AUTHORITATIVE_VISIBILITY_STATE
      ];
    if (
      ownerVisibilityState !==
        REPLICA_INVENTORY_OBSERVATION_STATE.OWNER_ADJUDICATED_EMPTY
    ) {
      return null;
    }
    return Object.freeze({
      state: REPLICA_INVENTORY_OBSERVATION_STATE.OWNER_ADJUDICATED_EMPTY,
      operations: Object.freeze([]),
    });
  }

  buildPriorityRecoveryFollowUpHealthyNodeSet(currentReplicas = []) {
    return new Set(
      this.getHealthyReplicas(currentReplicas)
        .map(readFollowUpNodeId)
        .filter((nodeId) => nodeId.length > 0),
    );
  }

  buildPriorityRecoveryFollowUpOccupiedNodeSet(
    currentReplicas = [],
    inventory = null,
  ) {
    return new Set(
      (inventory || this.buildPriorityRecoveryFollowUpInventory(
        currentReplicas,
        this.entityId,
      )).occupiedNodeIds,
    );
  }

  buildPriorityRecoveryFollowUpPendingTargetNodeSet(
    decision = null,
    inventory = null,
  ) {
    const followUpPartitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    const resolvedInventory = inventory ||
      this.buildPriorityRecoveryFollowUpInventory([], followUpPartitionId);
    return new Set(
      resolvedInventory.operations
        .map((operation) => operation.targetNodeId)
        .filter((nodeId) => nodeId.length > 0),
    );
  }

  buildPriorityRecoveryFollowUpCrossPartitionPendingTargetNodeSet(
    decision = null,
  ) {
    const followUpPartitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    const pendingTargetNodeIds = new Set();
    for (const operation of this.getGlobalTopologyBlockingInFlightOperations()) {
      const operationPartitionId =
        readFollowUpOperationPartitionId(operation);
      if (
        followUpPartitionId.length > 0 &&
        operationPartitionId.length > 0 &&
        operationPartitionId === followUpPartitionId
      ) {
        continue;
      }
      const targetNodeId = readFollowUpOperationTargetNodeId(operation);
      if (targetNodeId.length > 0) {
        pendingTargetNodeIds.add(targetNodeId);
      }
    }
    return pendingTargetNodeIds;
  }

  // Only ADD increases replica count; REPLACE and REMOVE cannot fill a deficit.
  countPriorityRecoveryFollowUpInFlightAdds(partitionId, inventory = null) {
    return inFlightAddInfluenceCount(
      inventory || this.buildPriorityRecoveryFollowUpInventory([], partitionId),
    );
  }

  // Occupied count includes settled learners so re-decisions do not mint ADDs.
  isPriorityRecoveryFollowUpDeficitSatisfiedByInFlightAdds(
    partitionId,
    occupiedReplicaCount,
    targetReplicaCount,
    inventory = null,
  ) {
    const inFlightAddCount =
      this.countPriorityRecoveryFollowUpInFlightAdds(partitionId, inventory);
    return occupiedReplicaCount + inFlightAddCount >= targetReplicaCount;
  }

  resolvePriorityRecoveryFollowUpCandidateNodeIds(
    decision,
    targetState = null,
  ) {
    const eligibleNodeIds =
      this.resolvePriorityRecoveryFollowUpEligibleNodeIds(decision);
    const targetNodeIds = this.normalizePriorityRecoveryFollowUpNodeIds([
      targetState?.[PRIORITY_RECOVERY_FOLLOW_UP_TARGET_STATE_FIELD.TARGET_NODES],
    ]);
    if (targetNodeIds.length === 0) {
      return eligibleNodeIds;
    }
    const targetNodeIdSet = new Set(targetNodeIds);
    return [
      ...eligibleNodeIds.filter((nodeId) => targetNodeIdSet.has(nodeId)),
      ...eligibleNodeIds.filter(
        (nodeId) =>
          !targetNodeIdSet.has(nodeId) &&
          this.isPriorityRecoveryFollowUpTargetRecoveryOnly(nodeId),
      ),
    ];
  }

  isPriorityRecoveryFollowUpTargetRecoveryOnly(nodeId) {
    const readiness = readFollowUpTargetReadiness(this, nodeId);
    const dimensions = readiness?.dimensions || {};
    return (
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === false
    );
  }

  isPriorityRecoveryFollowUpTargetKnownLocallyNotReady(nodeId) {
    if (
      nodeId.length === 0 ||
      typeof this.systemTableCache?.get !== 'function'
    ) {
      return false;
    }
    const nodeRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, nodeId);
    if (!nodeRow || typeof nodeRow !== 'object') {
      return false;
    }
    const status = nodeRow.status;
    const nodeStatusKnownNotActive =
      typeof status === 'string' && status !== NodeStatus.ACTIVE;
    if (nodeStatusKnownNotActive) {
      return true;
    }
    if (this.isPriorityRecoveryFollowUpTargetRecoveryEligible(nodeId)) {
      return false;
    }
    const nodeReady = isNodeRecordReady(nodeRow, {now: Date.now()});
    const readyLeaseExplicitlyCleared =
      isNodeReadyLeaseExplicitlyCleared(nodeRow, {
        requireActiveStatus: false,
      });
    return (
      (status === NodeStatus.ACTIVE && !nodeReady) ||
      readyLeaseExplicitlyCleared
    );
  }

  isPriorityRecoveryFollowUpTargetRecoveryEligible(nodeId) {
    const readiness = readFollowUpTargetReadiness(this, nodeId);
    return readiness?.dimensions?.[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ] === true;
  }

  selectPriorityRecoveryFollowUpTargetNodeId(
    decision,
    currentReplicas = [],
    targetState = null,
    inventory = null,
  ) {
    const targetStateInventory =
      targetState?.topologyTransitionSnapshot?.inventory;
    const followUpPartitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    const resolvedInventory = resolveFollowUpInventory(this, {
      inventory,
      targetStateInventory,
      partitionId: followUpPartitionId,
      currentReplicas,
    });
    if (resolvedInventory.provenance.topologyIncreaseUsable !== true) {
      return null;
    }
    const eligibleNodeIds =
      this.resolvePriorityRecoveryFollowUpCandidateNodeIds(
        decision,
        targetState,
      );
    const healthyNodeIds =
      this.buildPriorityRecoveryFollowUpHealthyNodeSet(currentReplicas);
    const occupiedNodeIds =
      this.buildPriorityRecoveryFollowUpOccupiedNodeSet(
        currentReplicas,
        resolvedInventory,
      );
    const pendingTargetNodeIds =
      this.buildPriorityRecoveryFollowUpPendingTargetNodeSet(
        decision,
        resolvedInventory,
      );
    const crossPartitionPendingTargetNodeIds =
      this.buildPriorityRecoveryFollowUpCrossPartitionPendingTargetNodeSet(
        decision,
      );
    return selectFollowUpTargetNodeId(this, eligibleNodeIds, {
      healthyNodeIds,
      occupiedNodeIds,
      pendingTargetNodeIds,
      crossPartitionPendingTargetNodeIds,
      previousFailedTargetNodeId:
        readPreviousFailedTargetNodeId(decision),
    });
  }

  selectPriorityRecoveryFollowUpSourceReplica(
    healthyReplicas = [],
    targetNodeId = UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
  ) {
    const replicasByNodeId = new Map();
    for (const replica of healthyReplicas) {
      const nodeId = readFollowUpNodeId(replica);
      if (nodeId.length === 0) {
        continue;
      }
      if (!replicasByNodeId.has(nodeId)) {
        replicasByNodeId.set(nodeId, []);
      }
      replicasByNodeId.get(nodeId).push(replica);
    }
    for (const [nodeId, replicas] of replicasByNodeId.entries()) {
      if (nodeId === targetNodeId || replicas.length <= 1) {
        continue;
      }
      return replicas[0];
    }
    return (
      healthyReplicas.find((replica) => {
        const nodeId = readFollowUpNodeId(replica);
        return nodeId.length > 0 && nodeId !== targetNodeId;
      }) || null
    );
  }

  buildPriorityRecoveryFollowUpMoveOutcome(
    state,
    reason,
    move = undefined,
  ) {
    const moveFields =
      move && typeof move === 'object' ?
        move :
        {};
    return Object.freeze({
      ...moveFields,
      [PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE]: state,
      [PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.REASON]: reason,
    });
  }

  isPriorityRecoveryFollowUpMoveCreated(followUpMove = undefined) {
    const state =
      followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE];
    return state === PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.MOVE_CREATED ||
      state ===
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.SOURCE_FALLBACK_ADD_CREATED ||
      (state === undefined && typeof followUpMove?.type === 'string');
  }

  buildPriorityRecoveryFollowUpSerialWaitMoveFields(decision = null) {
    const coordinator =
      decision?.decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.COORDINATOR
      ] || {};
    return copyFrozenArrayFields(
      coordinator,
      PRIORITY_RECOVERY_SERIAL_WAIT_FIELDS,
    );
  }

  buildPriorityRecoveryFollowUpMove(context = {}) {
    const decision = context.decision || null;
    const decisionSnapshot = decision?.decisionSnapshot || null;
    if (
      !this.isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot)
    ) {
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.NOT_REQUIRED,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.NOT_REQUIRED,
      );
    }
    const partitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    const currentReplicas =
      this.resolvePriorityRecoveryFollowUpCurrentReplicas(
        decision,
        context.currentReplicas,
      );
    const targetStateInventory =
      context.targetState?.topologyTransitionSnapshot?.inventory;
    const ownerOperationObservation =
      this.resolvePriorityRecoveryFollowUpOwnerOperationObservation(decision);
    const inventory = resolveFollowUpInventory(this, {
      targetStateInventory,
      partitionId,
      currentReplicas,
      ownerOperationObservation,
    });
    const healthyReplicas = this.getHealthyReplicas(currentReplicas);
    const targetReplicaCount =
      this.resolvePriorityRecoveryFollowUpTargetReplicaCount(
        decision,
        context.targetState,
      );
    // ACTIVE count suppresses add-like work only after a terminal projection;
    // an occupied SYNCING row may still need the replacement cure below.
    if (inventory.accounting.activeCount > targetReplicaCount) {
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.OVER_REPLICATION_SUPPRESSED,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.OVER_REPLICATION_SUPPRESSED,
      );
    }
    const targetNodeId = this.selectPriorityRecoveryFollowUpTargetNodeId(
      decision,
      currentReplicas,
      context.targetState,
      inventory,
    );
    if (!targetNodeId) {
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.TARGET_UNAVAILABLE,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.TARGET_UNAVAILABLE,
      );
    }
    const serialWaitMoveFields =
      this.buildPriorityRecoveryFollowUpSerialWaitMoveFields(decision);
    const sourceReplica = this.selectPriorityRecoveryFollowUpSourceReplica(
      healthyReplicas,
      targetNodeId,
    );
    // The cure policy owns condition-to-move typing.
    const cureCondition = classifyPriorityRecoveryFollowUpCureCondition({
      healthyReplicaCount: healthyReplicas.length,
      targetReplicaCount,
      hasSelectableSourceReplica: Boolean(sourceReplica),
    });
    const moveContext = {
      cureCondition,
      currentReplicas,
      healthyReplicas,
      inventory,
      partitionId,
      serialWaitMoveFields,
      sourceReplica,
      targetNodeId,
      targetReplicaCount,
    };
    return cureCondition === PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION ?
      buildDeficitFollowUpMove(this, moveContext) :
      buildRelocationFollowUpMove(this, moveContext);
  }

  async executeMove(move) {
    move = this.canonicalizeRebalancerMove(move);
    if (this.isShuttingDown) {
      return this.buildSkippedMoveResult(
        REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
        move,
      );
    }

    this.logExecuteMove(move);

    try {
      const readinessSkip = await this.resolveMoveTargetReadinessSkip(move);
      if (readinessSkip) {
        return readinessSkip;
      }

      if (!this.rebalanceCoordinator) {
        throw new Error(REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED);
      }

      const outcome = await this.executeMoveViaCoordinator(move);
      if (outcome?.skipped === true) {
        this.logSkippedMoveOutcome(move, outcome);
      }
      return outcome;
    } catch (error) {
      this.logger.error(REBALANCER_LOG_MSG.MOVE_FAILED, {
        entityId: this.entityId,
        moveType: move.type,
        moveTargetNodeId: move.nodeId || null,
        error: error.message,
      });
      throw error;
    }
  }

  // Logging injects local nodeId, so the target needs a distinct field.
  logExecuteMove(move) {
    this.logger.info(REBALANCER_LOG_MSG.EXECUTE_MOVE, {
      entityId: this.entityId,
      entityType: this.entityType,
      ...buildMoveLogFields(move),
      moveSourceNodeId: move.sourceNodeId || null,
      moveReplicaId: move.replicaId || null,
      reason: move.reason,
      usingCoordinator: !!this.rebalanceCoordinator,
    });
  }

  async resolveMoveTargetReadinessSkip(move) {
    if (!move?.nodeId || !this.shouldRequireMoveTargetReadiness(move)) {
      return null;
    }
    const skipDetail = await this.getNodeReadinessSkipReason(move.nodeId);
    if (skipDetail === null) {
      return null;
    }
    this.logger.debug(REBALANCER_LOG_MSG.SKIP_UNREADY_NODE, {
      entityId: this.entityId,
      moveTargetNodeId: move.nodeId || null,
      moveType: move.type,
      skipDetail,
    });
    return this.buildSkippedMoveResult(
      REBALANCER_SKIP_REASON.NODE_NOT_READY,
      move,
      {
        skipDetail,
      },
    );
  }

  logSkippedMoveOutcome(move, outcome) {
    this.logger.info(REBALANCER_LOG_MSG.MOVE_SKIPPED, {
      entityId: this.entityId,
      entityType: this.entityType,
      ...buildMoveLogFields(move),
      reason: outcome.reason || null,
      error: outcome.error || null,
      admissionDecisionType: outcome?.admission?.decisionType || null,
      admissionReason: outcome?.admission?.reason || null,
      admissionBlockingReasonCodes:
        normalizeAdmissionBlockingReasonCodes(outcome),
      admissionTopologySnapshot:
        outcome?.admission?.topologySnapshot || null,
    });
  }
}

// Carry the move partition separately from this rebalancer's entityId.
function buildMoveLogFields(move) {
  return {
    moveType: move.type,
    movePartitionId: move.partitionId || move.entityId || null,
    moveTargetNodeId: move.nodeId || null,
    replicaId: move.replicaId || null,
  };
}

function normalizeAdmissionBlockingReasonCodes(outcome) {
  if (!Array.isArray(outcome?.admission?.blockingReasons)) {
    return [];
  }
  return outcome.admission.blockingReasons
    .map((reason) =>
      String(reason?.code || reason?.reason || reason || '').trim(),
    )
    .filter((reason) => reason.length > 0);
}

applyUnifiedRebalancerFollowUpAugmentationMethods(UnifiedRebalancerFollowUpMove);
export {UnifiedRebalancerFollowUpMove};
