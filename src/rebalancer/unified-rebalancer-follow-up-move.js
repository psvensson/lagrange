import {UnifiedRebalancerFollowUpDecision} from './unified-rebalancer-follow-up-decision.js';
import {
  applyUnifiedRebalancerFollowUpAugmentationMethods,
} from './unified-rebalancer-follow-up-augmentation-methods.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';

const {
  EntityType,
  MOVE_REASON,
  MoveType,
  NUM,
  PRIORITY_RECOVERY_FOLLOW_UP_FIELD,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE,
  PRIORITY_RECOVERY_FOLLOW_UP_UNOCCUPIED_SERVICE_STATUSES,
  REBALANCER_ERROR_MSG,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_FIELD,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  REBALANCER_TARGET_READINESS_MODE,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  TYPEOF,
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
});

class UnifiedRebalancerFollowUpMove extends UnifiedRebalancerFollowUpDecision {
  buildPriorityRecoveryFollowUpHealthyNodeSet(currentReplicas = []) {
    return new Set(
      this.getHealthyReplicas(currentReplicas)
        .map((replica) =>
          String(
            replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
              replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
              UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((nodeId) => nodeId.length > NUM.ZERO),
    );
  }

  buildPriorityRecoveryFollowUpOccupiedNodeSet(currentReplicas = []) {
    const occupiedNodeIds = new Set();
    const replicas = Array.isArray(currentReplicas) ? currentReplicas : [];
    for (const replica of replicas) {
      const nodeId = String(
        replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
          replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      const status = String(
        replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.STATUS] ??
          ReplicaStatus.ACTIVE,
      ).toLowerCase();
      if (PRIORITY_RECOVERY_FOLLOW_UP_UNOCCUPIED_SERVICE_STATUSES.has(status)) {
        continue;
      }
      occupiedNodeIds.add(nodeId);
    }
    return occupiedNodeIds;
  }

  buildPriorityRecoveryFollowUpPendingTargetNodeSet(decision = null) {
    const followUpPartitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    const pendingTargetNodeIds = new Set();
    for (const operation of this.getTopologyBlockingInFlightOperations()) {
      const operationPartitionId = String(
        operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE] ||
          operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ENTITY_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (
        followUpPartitionId.length > NUM.ZERO &&
        operationPartitionId.length > NUM.ZERO &&
        operationPartitionId !== followUpPartitionId
      ) {
        continue;
      }
      const targetNodeId = String(
        operation?.target_node_id ||
          operation?.targetNodeId ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (targetNodeId.length > NUM.ZERO) {
        pendingTargetNodeIds.add(targetNodeId);
      }
    }
    return pendingTargetNodeIds;
  }

  buildPriorityRecoveryFollowUpCrossPartitionPendingTargetNodeSet(
    decision = null,
  ) {
    const followUpPartitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    const pendingTargetNodeIds = new Set();
    for (const operation of this.getGlobalTopologyBlockingInFlightOperations()) {
      const operationPartitionId = String(
        operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE] ||
          operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ENTITY_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (
        followUpPartitionId.length > NUM.ZERO &&
        operationPartitionId.length > NUM.ZERO &&
        operationPartitionId === followUpPartitionId
      ) {
        continue;
      }
      const targetNodeId = String(
        operation?.target_node_id ||
          operation?.targetNodeId ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (targetNodeId.length > NUM.ZERO) {
        pendingTargetNodeIds.add(targetNodeId);
      }
    }
    return pendingTargetNodeIds;
  }

  /**
   * Count the replica-count-increasing ADD operations already in flight for this
   * follow-up partition. REPLACE is count-neutral (adds one, removes one) and
   * REMOVE decreases the count, so only `add`-type operations are tallied. The
   * topology-blocking in-flight view is already entity-scoped; the partition
   * re-check mirrors the sibling pending-target helpers and is defensive against
   * any global view.
   * @param {string} partitionId
   * @return {number}
   */
  countPriorityRecoveryFollowUpInFlightAdds(partitionId) {
    const followUpPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    let inFlightAddCount = NUM.ZERO;
    for (const operation of this.getTopologyBlockingInFlightOperations()) {
      const operationType = String(
        operation?.type ||
          operation?.operation_type ||
          operation?.operationType ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).toLowerCase();
      if (operationType !== MoveType.ADD) {
        continue;
      }
      const operationPartitionId = String(
        operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE] ||
          operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ENTITY_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (
        followUpPartitionId.length > NUM.ZERO &&
        operationPartitionId.length > NUM.ZERO &&
        operationPartitionId !== followUpPartitionId
      ) {
        continue;
      }
      inFlightAddCount += NUM.ONE;
    }
    return inFlightAddCount;
  }

  /**
   * @param {string} partitionId
   * @param {number} healthyReplicaCount
   * @param {number} targetReplicaCount
   * @return {boolean} true when in-flight ADDs already cover the deficit so a new
   *   ADD would only re-issue work that is still settling.
   */
  isPriorityRecoveryFollowUpDeficitSatisfiedByInFlightAdds(
    partitionId,
    healthyReplicaCount,
    targetReplicaCount,
  ) {
    const inFlightAddCount =
      this.countPriorityRecoveryFollowUpInFlightAdds(partitionId);
    return healthyReplicaCount + inFlightAddCount >= targetReplicaCount;
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
    if (targetNodeIds.length === NUM.ZERO) {
      return eligibleNodeIds;
    }
    const targetNodeIdSet = new Set(targetNodeIds);
    return eligibleNodeIds.filter((nodeId) => targetNodeIdSet.has(nodeId));
  }

  isPriorityRecoveryFollowUpTargetKnownLocallyNotReady(nodeId) {
    if (
      nodeId.length === NUM.ZERO ||
      typeof this.systemTableCache?.get !== TYPEOF.FUNCTION
    ) {
      return false;
    }
    const nodeRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, nodeId);
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      return false;
    }
    const status = nodeRow.status;
    const nodeStatusKnownNotActive =
      typeof status === TYPEOF.STRING && status !== NodeStatus.ACTIVE;
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
    if (
      nodeId.length === NUM.ZERO ||
      typeof this.controlPlaneReadinessService?.getNodeReadinessSync !==
        TYPEOF.FUNCTION
    ) {
      return false;
    }
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      nodeId,
      {allowStaleOnCacheChange: false},
    );
    return readiness?.dimensions?.[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ] === true;
  }

  selectPriorityRecoveryFollowUpTargetNodeId(
    decision,
    currentReplicas = [],
    targetState = null,
  ) {
    const eligibleNodeIds =
      this.resolvePriorityRecoveryFollowUpCandidateNodeIds(
        decision,
        targetState,
      );
    const healthyNodeIds =
      this.buildPriorityRecoveryFollowUpHealthyNodeSet(currentReplicas);
    const occupiedNodeIds =
      this.buildPriorityRecoveryFollowUpOccupiedNodeSet(currentReplicas);
    const pendingTargetNodeIds =
      this.buildPriorityRecoveryFollowUpPendingTargetNodeSet(decision);
    const crossPartitionPendingTargetNodeIds =
      this.buildPriorityRecoveryFollowUpCrossPartitionPendingTargetNodeSet(
        decision,
      );
    const previousFailedTargetNodeId = String(
      decision?.decisionSnapshot?.coordinator?.operation?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.TARGET_NODE_ID
      ] || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const unusedEligibleNodeIds = eligibleNodeIds.filter(
      (nodeId) =>
        !healthyNodeIds.has(nodeId) &&
        !occupiedNodeIds.has(nodeId) &&
        !pendingTargetNodeIds.has(nodeId) &&
        !crossPartitionPendingTargetNodeIds.has(nodeId) &&
        !this.isPriorityRecoveryFollowUpTargetKnownLocallyNotReady(nodeId),
    );
    const preferredUnusedEligibleNodeId = unusedEligibleNodeIds.find(
      (nodeId) => nodeId !== previousFailedTargetNodeId,
    );
    if (preferredUnusedEligibleNodeId) {
      return preferredUnusedEligibleNodeId;
    }
    if (unusedEligibleNodeIds.length > NUM.ZERO) {
      return unusedEligibleNodeIds[NUM.ZERO];
    }
    return (
      eligibleNodeIds.find(
        (nodeId) =>
          !occupiedNodeIds.has(nodeId) &&
          !pendingTargetNodeIds.has(nodeId) &&
          !this.isPriorityRecoveryFollowUpTargetKnownLocallyNotReady(nodeId),
      ) ||
      null
    );
  }

  selectPriorityRecoveryFollowUpSourceReplica(
    healthyReplicas = [],
    targetNodeId = UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
  ) {
    const replicasByNodeId = new Map();
    for (const replica of healthyReplicas) {
      const nodeId = String(
        replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
          replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      if (!replicasByNodeId.has(nodeId)) {
        replicasByNodeId.set(nodeId, []);
      }
      replicasByNodeId.get(nodeId).push(replica);
    }
    for (const [nodeId, replicas] of replicasByNodeId.entries()) {
      if (nodeId === targetNodeId || replicas.length <= NUM.ONE) {
        continue;
      }
      return replicas[NUM.ZERO];
    }
    return (
      healthyReplicas.find((replica) => {
        const nodeId = String(
          replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
            replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
            UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
        ).trim();
        return nodeId.length > NUM.ZERO && nodeId !== targetNodeId;
      }) || null
    );
  }

  buildPriorityRecoveryFollowUpMoveOutcome(
    state,
    reason,
    move = undefined,
  ) {
    const moveFields =
      move && typeof move === TYPEOF.OBJECT ?
        move :
        {};
    return Object.freeze({
      ...moveFields,
      [PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE]: state,
      [PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.REASON]: reason,
    });
  }

  isPriorityRecoveryFollowUpMoveCreated(followUpMove = undefined) {
    return (
      followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE] ===
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.MOVE_CREATED ||
      followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE] ===
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.SOURCE_FALLBACK_ADD_CREATED ||
      (
        followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE] ===
          undefined &&
        typeof followUpMove?.type === TYPEOF.STRING
      )
    );
  }

  buildPriorityRecoveryFollowUpSerialWaitMoveFields(decision = null) {
    const coordinator =
      decision?.decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.COORDINATOR
      ] || {};
    const serialWaitMoveFields = {};
    if (Array.isArray(
      coordinator?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_OPERATION_IDS
      ],
    )) {
      serialWaitMoveFields[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_OPERATION_IDS
      ] = Object.freeze([
        ...coordinator[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_OPERATION_IDS
        ],
      ]);
    }
    if (Array.isArray(
      coordinator?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_PARTITION_IDS
      ],
    )) {
      serialWaitMoveFields[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_PARTITION_IDS
      ] = Object.freeze([
        ...coordinator[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_PARTITION_IDS
        ],
      ]);
    }
    return Object.freeze(serialWaitMoveFields);
  }

  buildPriorityRecoveryFollowUpMove(context = {}) {
    const decision = context.decision || null;
    if (
      !this.isPriorityRecoveryFollowUpOperationRequired(
        decision?.decisionSnapshot || null,
      )
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
    const targetNodeId = this.selectPriorityRecoveryFollowUpTargetNodeId(
      decision,
      currentReplicas,
      context.targetState,
    );
    if (!targetNodeId) {
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.TARGET_UNAVAILABLE,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.TARGET_UNAVAILABLE,
      );
    }
    const serialWaitMoveFields =
      this.buildPriorityRecoveryFollowUpSerialWaitMoveFields(decision);
    const healthyReplicas = this.getHealthyReplicas(currentReplicas);
    const targetReplicaCount =
      this.resolvePriorityRecoveryFollowUpTargetReplicaCount(
        decision,
        context.targetState,
      );
    const sourceReplica = this.selectPriorityRecoveryFollowUpSourceReplica(
      healthyReplicas,
      targetNodeId,
    );
    const shouldReplace =
      healthyReplicas.length >= targetReplicaCount && !!sourceReplica;
    if (!shouldReplace) {
      // Count-aware deficit gate: a genuine replica-count deficit may legitimately
      // need several concurrent ADDs (fresh-partition provisioning fills 0 -> N),
      // but the re-decision storm re-issues an ADD every tick while a prior ADD is
      // still settling (learner catch-up/promotion runs slower than the ~1s plan
      // cadence). Only emit a deficit ADD when current healthy replicas plus the
      // replica-count-increasing ADDs already in flight still fall short of the
      // target; otherwise defer until an in-flight ADD terminalizes. This bounds
      // the storm to the true deficit without throwing on provisioning.
      if (
        healthyReplicas.length < targetReplicaCount &&
        this.isPriorityRecoveryFollowUpDeficitSatisfiedByInFlightAdds(
          partitionId,
          healthyReplicas.length,
          targetReplicaCount,
        )
      ) {
        return this.buildPriorityRecoveryFollowUpMoveOutcome(
          PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.IN_FLIGHT_ADD_SATISFIES_DEFICIT,
          PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.IN_FLIGHT_ADD_SATISFIES_DEFICIT,
        );
      }
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.MOVE_CREATED,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.ADD_FOLLOW_UP_CREATED,
        Object.freeze({
          type: MoveType.ADD,
          partitionId,
          entityType: EntityType.PARTITION,
          entityId: partitionId,
          nodeId: targetNodeId,
          reason: MOVE_REASON.INCREASE_REPLICA_COUNT,
          controlPlaneMutationWorkClass: UNIFIED_REBALANCER_LITERAL.BACKGROUND,
          ...serialWaitMoveFields,
          [REBALANCER_MOVE_FIELD.TARGET_READINESS_MODE]:
            REBALANCER_TARGET_READINESS_MODE.DEFER_TO_WORKFLOW_OWNER,
        }),
      );
    }
    const sourceNodeId = String(
      sourceReplica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
        sourceReplica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const replicaId = String(
      sourceReplica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.REPLICA_ID] ||
        sourceReplica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERVICE_ID] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (sourceNodeId.length === NUM.ZERO || replicaId.length === NUM.ZERO) {
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.SOURCE_FALLBACK_ADD_CREATED,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.SOURCE_UNAVAILABLE,
        Object.freeze({
          type: MoveType.ADD,
          partitionId,
          entityType: EntityType.PARTITION,
          entityId: partitionId,
          nodeId: targetNodeId,
          reason: MOVE_REASON.INCREASE_REPLICA_COUNT,
          controlPlaneMutationWorkClass: UNIFIED_REBALANCER_LITERAL.BACKGROUND,
          ...serialWaitMoveFields,
          [REBALANCER_MOVE_FIELD.TARGET_READINESS_MODE]:
            REBALANCER_TARGET_READINESS_MODE.DEFER_TO_WORKFLOW_OWNER,
        }),
      );
    }
    return this.buildPriorityRecoveryFollowUpMoveOutcome(
      PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.MOVE_CREATED,
      PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.REPLACE_FOLLOW_UP_CREATED,
      Object.freeze({
        type: MoveType.REPLACE,
        partitionId,
        entityType: EntityType.PARTITION,
        entityId: partitionId,
        nodeId: targetNodeId,
        sourceNodeId,
        replicaId,
        reason: MOVE_REASON.REPLACE_REPLICA,
        controlPlaneMutationWorkClass: UNIFIED_REBALANCER_LITERAL.BACKGROUND,
        ...serialWaitMoveFields,
        [REBALANCER_MOVE_FIELD.TARGET_READINESS_MODE]:
          REBALANCER_TARGET_READINESS_MODE.DEFER_TO_WORKFLOW_OWNER,
      }),
    );
  }

  async executeMove(move) {
    if (this.isShuttingDown) {
      return this.buildSkippedMoveResult(
        REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
        move,
      );
    }

    // LoggingService injects the local nodeId into every payload, so the
    // move target must use a distinct key to survive in the emitted line.
    this.logger.info(REBALANCER_LOG_MSG.EXECUTE_MOVE, {
      entityId: this.entityId,
      entityType: this.entityType,
      moveType: move.type,
      moveTargetNodeId: move.nodeId || null,
      moveSourceNodeId: move.sourceNodeId || null,
      moveReplicaId: move.replicaId || null,
      reason: move.reason,
      usingCoordinator: !!this.rebalanceCoordinator,
    });

    try {
      if (
        move?.nodeId &&
        this.shouldRequireMoveTargetReadiness(move)
      ) {
        const skipDetail = await this.getNodeReadinessSkipReason(move.nodeId);
        if (skipDetail !== null) {
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
      }

      if (!this.rebalanceCoordinator) {
        throw new Error(REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED);
      }

      const outcome = await this.executeMoveViaCoordinator(move);
      if (outcome?.skipped === true) {
        const admissionBlockingReasonCodes = Array.isArray(
          outcome?.admission?.blockingReasons,
        ) ?
          outcome.admission.blockingReasons
            .map((reason) =>
              String(reason?.code || reason?.reason || reason || '').trim(),
            )
            .filter((reason) => reason.length > NUM.ZERO) :
          [];
        this.logger.info(REBALANCER_LOG_MSG.MOVE_SKIPPED, {
          entityId: this.entityId,
          entityType: this.entityType,
          moveType: move.type,
          moveTargetNodeId: move.nodeId || null,
          replicaId: move.replicaId || null,
          reason: outcome.reason || null,
          error: outcome.error || null,
          admissionDecisionType: outcome?.admission?.decisionType || null,
          admissionReason: outcome?.admission?.reason || null,
          admissionBlockingReasonCodes,
        });
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
}

applyUnifiedRebalancerFollowUpAugmentationMethods(UnifiedRebalancerFollowUpMove);

export {UnifiedRebalancerFollowUpMove};
