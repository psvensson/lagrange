import {UnifiedRebalancerSegment4Stage2} from './unified-rebalancer-segment-4-stage-2.js';
import {UNIFIED_REBALANCER_SEGMENT_4_STAGE_SHARED as SHARED} from './unified-rebalancer-segment-4-stage-shared.js';

const {
  EntityType,
  MOVE_REASON,
  MoveType,
  NUM,
  PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION,
  PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION_BY_STATE,
  PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE,
  PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE_TABLE,
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
  NodeStatus,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
} = SHARED.UNIFIED_REBALANCER_SHARED;

const PRIORITY_RECOVERY_FOLLOW_UP_TARGET_STATE_FIELD = Object.freeze({
  TARGET_NODES: 'targetNodes',
});

class UnifiedRebalancerSegment4Stage3 extends UnifiedRebalancerSegment4Stage2 {
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

  buildPriorityRecoveryFollowUpPendingTargetNodeSet() {
    return new Set(
      this.getTopologyBlockingInFlightOperations()
        .map((operation) =>
          String(
            operation?.target_node_id ||
              operation?.targetNodeId ||
              UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((nodeId) => nodeId.length > NUM.ZERO),
    );
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
    const nodeReady = isNodeRecordReady(nodeRow, {now: Date.now()});
    const readyLeaseExplicitlyCleared =
      isNodeReadyLeaseExplicitlyCleared(nodeRow, {
        requireActiveStatus: false,
      });
    return (
      nodeStatusKnownNotActive ||
      (
        status === NodeStatus.ACTIVE &&
        !nodeReady
      ) ||
      readyLeaseExplicitlyCleared
    );
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

  buildPriorityRecoveryFollowUpAugmentationEvidence({
    moves = [],
    followUpMove = null,
  } = {}) {
    const followUpMoveCreated =
      this.isPriorityRecoveryFollowUpMoveCreated(followUpMove);
    const followUpPartitionId = String(
      followUpMoveCreated ?
        followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE] ||
          followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ENTITY_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING :
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return Object.freeze({
      hasFollowUpMove: followUpMoveCreated,
      hasAddLikeCalculatedMove:
        this.hasPriorityBudgetBypassCandidateMove(moves),
      followUpPartitionId,
      followUpTargetsCurrentEntity:
        followUpPartitionId.length > NUM.ZERO &&
        followUpPartitionId === this.entityId,
    });
  }

  resolvePriorityRecoveryCurrentFollowUpPartitionId(move = {}) {
    const explicitPartitionId = String(
      move?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
        move?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE] ||
        move?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ENTITY_ID] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (explicitPartitionId.length > NUM.ZERO) {
      return explicitPartitionId;
    }
    if (move?.type === MoveType.ADD || move?.type === MoveType.REPLACE) {
      return String(
        this.entityId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
    }
    return UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
  }

  isPriorityRecoveryCurrentFollowUpMove(
    move = {},
    followUpPartitionId = UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
  ) {
    if (
      move?.type !== MoveType.ADD &&
      move?.type !== MoveType.REPLACE
    ) {
      return false;
    }
    const currentMovePartitionId =
      this.resolvePriorityRecoveryCurrentFollowUpPartitionId(move);
    return (
      followUpPartitionId.length > NUM.ZERO &&
      currentMovePartitionId === followUpPartitionId
    );
  }

  normalizePriorityRecoveryCurrentFollowUpMoves(
    moves = [],
    evidence = {},
  ) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    if (evidence.followUpTargetsCurrentEntity !== true) {
      return normalizedMoves;
    }
    const followUpPartitionId = String(
      evidence.followUpPartitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return normalizedMoves.map((move) => {
      if (
        !this.isPriorityRecoveryCurrentFollowUpMove(
          move,
          followUpPartitionId,
        )
      ) {
        return move;
      }
      return Object.freeze({
        ...move,
        [REBALANCER_MOVE_FIELD.TARGET_READINESS_MODE]:
          REBALANCER_TARGET_READINESS_MODE.DEFER_TO_WORKFLOW_OWNER,
      });
    });
  }

  resolvePriorityRecoveryFollowUpAugmentationState(evidence = {}) {
    const tableEntry =
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      );
    return tableEntry ?
      tableEntry.state :
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE.NO_FOLLOW_UP;
  }

  resolvePriorityRecoveryFollowUpAugmentationAction(evidence = {}) {
    const state =
      this.resolvePriorityRecoveryFollowUpAugmentationState(evidence);
    return (
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION_BY_STATE[state] ||
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION.KEEP_MOVES
    );
  }

  async augmentMovesWithPriorityRecoveryFollowUp(moves = [], context = {}) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    if (!this.isControlPlanePriorityPartition()) {
      return normalizedMoves;
    }
    const decision =
      context.decision ||
      (await this.getCurrentPriorityRecoveryFollowUpDecisionSnapshot());
    const currentFollowUpPartitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    const currentFollowUpAlreadyPlanned =
      currentFollowUpPartitionId.length > NUM.ZERO &&
      normalizedMoves.some((move) =>
        this.isPriorityRecoveryCurrentFollowUpMove(
          move,
          currentFollowUpPartitionId,
        ),
      );
    if (
      currentFollowUpAlreadyPlanned &&
      this.isPriorityRecoveryFollowUpOperationRequired(
        decision?.decisionSnapshot || null,
      )
    ) {
      const normalizedCurrentMoves =
        this.normalizePriorityRecoveryCurrentFollowUpMoves(
          normalizedMoves,
          Object.freeze({
            followUpPartitionId: currentFollowUpPartitionId,
            followUpTargetsCurrentEntity: true,
          }),
        );
      const planningSnapshot =
        decision?.planningSnapshot ||
        await this.getPriorityRecoveryPlanningSnapshot({
          partitionId: this.entityId,
        });
      return this.prependPriorityRecoverySurrogateFollowUpMoves(
        normalizedCurrentMoves,
        context,
        planningSnapshot,
        new Set([currentFollowUpPartitionId]),
      );
    }
    let followUpMove = this.buildPriorityRecoveryFollowUpMove({
      ...context,
      decision,
    });
    if (!this.isPriorityRecoveryFollowUpMoveCreated(followUpMove)) {
      const planningSnapshot =
        decision?.planningSnapshot ||
        await this.getPriorityRecoveryPlanningSnapshot({
          partitionId: this.entityId,
        });
      followUpMove = this.buildPriorityRecoveryFollowUpMove({
        ...context,
        decision: this.buildPriorityRecoverySurrogateFollowUpDecision(
          planningSnapshot,
        ),
      });
    }
    if (!this.isPriorityRecoveryFollowUpMoveCreated(followUpMove)) {
      return normalizedMoves;
    }
    const followUpPartitionId =
      this.resolvePriorityRecoveryCurrentFollowUpPartitionId(followUpMove);
    const augmentationEvidence =
      this.buildPriorityRecoveryFollowUpAugmentationEvidence({
        moves: normalizedMoves,
        followUpMove,
      });
    const augmentationAction =
      this.resolvePriorityRecoveryFollowUpAugmentationAction(
        augmentationEvidence,
      );
    if (
      augmentationAction ===
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION.PREPEND_FOLLOW_UP
    ) {
      const planningSnapshot =
        decision?.planningSnapshot ||
        await this.getPriorityRecoveryPlanningSnapshot({
          partitionId: this.entityId,
        });
      return this.prependPriorityRecoverySurrogateFollowUpMoves(
        [followUpMove, ...normalizedMoves],
        context,
        planningSnapshot,
        new Set([followUpPartitionId]),
      );
    }
    if (
      augmentationAction ===
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION
        .NORMALIZE_CURRENT_FOLLOW_UP
    ) {
      return this.normalizePriorityRecoveryCurrentFollowUpMoves(
        normalizedMoves,
        augmentationEvidence,
      );
    }
    return normalizedMoves;
  }

  prependPriorityRecoverySurrogateFollowUpMoves(
    moves = [],
    context = {},
    planningSnapshot = null,
    excludedPartitionIds = new Set(),
  ) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    const surrogateDecisions =
      this.buildPriorityRecoverySurrogateFollowUpDecisions(planningSnapshot);
    const followUpMoves = [];
    const followUpPartitionIds = new Set(excludedPartitionIds);
    for (const surrogateDecision of surrogateDecisions) {
      const surrogatePartitionId =
        this.resolvePriorityRecoveryFollowUpPartitionId(surrogateDecision);
      if (
        surrogatePartitionId.length === NUM.ZERO ||
        followUpPartitionIds.has(surrogatePartitionId)
      ) {
        continue;
      }
      const surrogateMove = this.buildPriorityRecoveryFollowUpMove({
        ...context,
        decision: surrogateDecision,
      });
      if (!this.isPriorityRecoveryFollowUpMoveCreated(surrogateMove)) {
        continue;
      }
      followUpPartitionIds.add(surrogatePartitionId);
      followUpMoves.push(surrogateMove);
    }
    if (followUpMoves.length === NUM.ZERO) {
      return normalizedMoves;
    }
    return [...followUpMoves, ...normalizedMoves];
  }

  async executeMove(move) {
    if (this.isShuttingDown) {
      return this.buildSkippedMoveResult(
        REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
        move,
      );
    }

    this.logger.info(REBALANCER_LOG_MSG.EXECUTE_MOVE, {
      entityId: this.entityId,
      entityType: this.entityType,
      moveType: move.type,
      nodeId: move.nodeId,
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
            nodeId: move.nodeId,
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
          nodeId: move.nodeId,
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
        nodeId: move.nodeId,
        error: error.message,
      });
      throw error;
    }
  }
}

export {UnifiedRebalancerSegment4Stage3};
