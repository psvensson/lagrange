import {UnifiedRebalancerSegment4Stage3} from './unified-rebalancer-segment-4-stage-3.js';
import {UNIFIED_REBALANCER_SEGMENT_4_STAGE_SHARED as SHARED} from './unified-rebalancer-segment-4-stage-shared.js';

const {
  MOVE_REASON,
  MoveType,
  NUM,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_FIELD,
  REBALANCER_PRE_EXECUTION_HANDOFF_STATE,
  REBALANCER_PRE_EXECUTION_HANDOFF_STATE_TABLE,
  REBALANCER_PRE_EXECUTION_READINESS_NODE_ID,
  REBALANCER_PRE_EXECUTION_READINESS_STATE,
  REBALANCER_PRE_EXECUTION_RETURN_STATE,
  REBALANCER_PRE_EXECUTION_RETURN_STATE_BY_HANDOFF_STATE,
  REBALANCER_PRE_EXECUTION_SKIP_DETAIL,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  REBALANCER_TARGET_READINESS_MODE,
  TYPEOF,
  UNIFIED_REBALANCER_LITERAL,
} = SHARED;

class UnifiedRebalancerSegment4Stage4 extends UnifiedRebalancerSegment4Stage3 {
  async executeMoveViaCoordinator(move) {
    if (this.isShuttingDown) {
      return this.buildSkippedMoveResult(
        REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
        move,
      );
    }

    const operationPartitionId = move.partitionId || this.entityId;
    const operationEntityType = move.entityType || this.entityType;
    const operationEntityId = move.entityId || operationPartitionId;
    const safetyError = await this.rebalanceCoordinator.getMoveSafetyError({
      ...move,
      partitionId: operationPartitionId,
      entityType: operationEntityType,
      entityId: operationEntityId,
    });
    if (safetyError) {
      this.logger.debug(REBALANCER_LOG_MSG.MOVE_BLOCKED_BY_SAFETY_POLICY, {
        entityId: this.entityId,
        entityType: this.entityType,
        partitionId: operationPartitionId,
        moveType: move.type,
        nodeId: move.nodeId,
        replicaId: move.replicaId,
        error: safetyError,
      });
      return this.buildSkippedMoveResult(
        REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
        move,
        {
          error: safetyError,
        },
      );
    }

    const operationType = this.resolveCoordinatorOperationType(move.type);

    const operationRequest = {
      type: operationType,
      partitionId: operationPartitionId,
      entityType: operationEntityType,
      entityId: operationEntityId,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
      sourceNodeId: move.sourceNodeId,
      enforceConcurrentOperationBudget: true,
    };
    const membershipPublicationEpoch = Number.isInteger(
      move?.membershipPublicationEpoch,
    ) ?
      move.membershipPublicationEpoch :
      this.resolvePublishedMembershipPlanningEpoch();
    if (
      Number.isInteger(membershipPublicationEpoch) &&
      membershipPublicationEpoch >= UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      operationRequest.membershipPublicationEpoch = membershipPublicationEpoch;
    }
    if (move?.controlPlaneMutationWorkClass) {
      operationRequest.controlPlaneMutationWorkClass =
        move.controlPlaneMutationWorkClass;
    }

    // Create operation record via coordinator.
    // Periodic planning already gates on local mutation readiness before
    // enqueueing moves, so direct move execution should only opt into
    // background mutation gating when the caller explicitly requests it.
    let operation = null;
    try {
      operation =
        await this.rebalanceCoordinator.createOperation(operationRequest);
    } catch (error) {
      if (error?.rebalanceSkipReason) {
        return this.buildSkippedMoveResult(error.rebalanceSkipReason, move);
      }
      if (error?.admissionResult) {
        return this.buildSkippedMoveResult(
          error.admissionResult.decisionType ||
            UNIFIED_REBALANCER_LITERAL.ADMISSION_DENIED,
          move,
          {
            admission: error.admissionResult,
          },
        );
      }
      throw error;
    }

    return {
      ...this.buildRebalanceResult(true, {
        replicaId: move.replicaId || operation.replicaId,
        nodeId: move.nodeId,
        operationId: operation.operationId,
        operation: move.type,
        status: UNIFIED_REBALANCER_LITERAL.SCHEDULED,
      }),
    };
  }

  hasPendingMove(replicaId) {
    const normalizedReplicaId = String(
      replicaId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (normalizedReplicaId.length === NUM.ZERO) {
      return false;
    }
    const inFlightOps = this.getInFlightOperations();
    return inFlightOps.some((operation) => {
      const operationReplicaId = this.getReplicaIdFromOperationRow(operation);
      const sourceReplicaId =
        this.getReplaceSourceReplicaIdFromOperationRow(operation);
      return (
        operationReplicaId === normalizedReplicaId ||
        sourceReplicaId === normalizedReplicaId
      );
    });
  }

  hasPendingAddForNode(nodeId) {
    const inFlightOps = this.getTopologyBlockingInFlightOperations();
    if (
      inFlightOps.some(
        (op) =>
          op.target_node_id === nodeId && this.isAddLikeInFlightOperation(op),
      )
    ) {
      return true;
    }
    return false;
  }

  groupMovesByTargetNode(moves) {
    const grouped = new Map();
    for (const move of moves) {
      const nodeId = move?.nodeId || null;
      if (!grouped.has(nodeId)) {
        grouped.set(nodeId, []);
      }
      grouped.get(nodeId).push(move);
    }
    return grouped;
  }

  resolvePreExecutionReadinessNodeId(move = {}) {
    const nodeId = String(
      move?.nodeId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return nodeId.length > NUM.ZERO ?
      nodeId :
      REBALANCER_PRE_EXECUTION_READINESS_NODE_ID.UNTARGETED;
  }

  resolveMoveTargetReadinessMode(move = {}) {
    const targetReadinessMode = String(
      move?.[REBALANCER_MOVE_FIELD.TARGET_READINESS_MODE] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return targetReadinessMode ===
      REBALANCER_TARGET_READINESS_MODE.DEFER_TO_WORKFLOW_OWNER ?
      REBALANCER_TARGET_READINESS_MODE.DEFER_TO_WORKFLOW_OWNER :
      REBALANCER_TARGET_READINESS_MODE.REQUIRE_READY;
  }

  shouldRequireMoveTargetReadiness(move = {}) {
    if (move?.type === MoveType.REMOVE) {
      return false;
    }
    return this.resolveMoveTargetReadinessMode(move) ===
      REBALANCER_TARGET_READINESS_MODE.REQUIRE_READY;
  }

  resolvePreExecutionReadinessState(skipDetail) {
    return skipDetail === REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE ?
      REBALANCER_PRE_EXECUTION_READINESS_STATE.READY :
      REBALANCER_PRE_EXECUTION_READINESS_STATE.BLOCKED;
  }

  normalizePreExecutionSkipDetail(skipDetail) {
    const normalizedSkipDetail = typeof skipDetail === TYPEOF.STRING ?
      skipDetail.trim() :
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
    return normalizedSkipDetail.length > NUM.ZERO ?
      normalizedSkipDetail :
      REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
  }

  buildPreExecutionReadinessGroups(moves = [], readinessByNodeId = new Map()) {
    const groupsByNodeId = new Map();
    for (const move of moves) {
      const nodeId = this.resolvePreExecutionReadinessNodeId(move);
      const current = groupsByNodeId.get(nodeId) || {
        nodeId,
        moveCount: NUM.ZERO,
        addLikeMoveCount: NUM.ZERO,
        removeMoveCount: NUM.ZERO,
        otherMoveCount: NUM.ZERO,
      };
      const addLikeMoveCount =
        move?.type === MoveType.ADD || move?.type === MoveType.REPLACE ?
          current.addLikeMoveCount + NUM.ONE :
          current.addLikeMoveCount;
      const removeMoveCount = move?.type === MoveType.REMOVE ?
        current.removeMoveCount + NUM.ONE :
        current.removeMoveCount;
      const otherMoveCount =
        move?.type !== MoveType.ADD &&
        move?.type !== MoveType.REPLACE &&
        move?.type !== MoveType.REMOVE ?
          current.otherMoveCount + NUM.ONE :
          current.otherMoveCount;
      groupsByNodeId.set(nodeId, {
        nodeId,
        moveCount: current.moveCount + NUM.ONE,
        addLikeMoveCount,
        removeMoveCount,
        otherMoveCount,
      });
    }

    return [...groupsByNodeId.values()].map((group) => {
      const skipDetail = readinessByNodeId.has(group.nodeId) ?
        readinessByNodeId.get(group.nodeId) :
        REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
      return {
        ...group,
        readinessState: this.resolvePreExecutionReadinessState(skipDetail),
        skipDetail: this.normalizePreExecutionSkipDetail(skipDetail),
      };
    });
  }

  buildPreExecutionSkipReasons(skippedResults = []) {
    return [...new Set(
      skippedResults
        .map((result) =>
          String(
            result?.reason || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((reason) => reason.length > NUM.ZERO),
    )].sort((left, right) => left.localeCompare(right));
  }

  resolvePreExecutionHandoffState(evidence = {}) {
    const entry = REBALANCER_PRE_EXECUTION_HANDOFF_STATE_TABLE.find((rule) =>
      rule.matches(evidence),
    );
    return entry?.state ||
      REBALANCER_PRE_EXECUTION_HANDOFF_STATE.READY_TO_EXECUTE;
  }

  resolvePreExecutionReturnState(handoffState) {
    return REBALANCER_PRE_EXECUTION_RETURN_STATE_BY_HANDOFF_STATE[
      handoffState
    ] || REBALANCER_PRE_EXECUTION_RETURN_STATE.CONTINUE;
  }

  buildPreExecutionHandoffSnapshot({
    moves = [],
    context = {},
    executableGroups = [],
    skippedResults = [],
    readinessGroups = [],
  } = {}) {
    const executableMoveCount = executableGroups.reduce(
      (count, group) => count + group.nodeMoves.length,
      NUM.ZERO,
    );
    const evidence = Object.freeze({
      shuttingDown: this.isShuttingDown === true,
      limitedMoveCount: moves.length,
      executableMoveCount,
      preExecuteSkippedMoveCount: skippedResults.length,
    });
    const preExecutionHandoffState =
      this.resolvePreExecutionHandoffState(evidence);
    const preExecuteReturnState =
      this.resolvePreExecutionReturnState(preExecutionHandoffState);
    const readyReadinessGroupCount = readinessGroups.filter((group) =>
      group.readinessState === REBALANCER_PRE_EXECUTION_READINESS_STATE.READY,
    ).length;
    const blockedReadinessGroupCount = readinessGroups.filter((group) =>
      group.readinessState === REBALANCER_PRE_EXECUTION_READINESS_STATE.BLOCKED,
    ).length;

    return {
      trigger: String(
        context.trigger || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim(),
      plannedMoveCount: Number.isFinite(context.plannedMoveCount) ?
        Math.trunc(context.plannedMoveCount) :
        moves.length,
      moveLimit: Number.isFinite(context.moveLimit) ?
        Math.trunc(context.moveLimit) :
        moves.length,
      limitedMoveCount: moves.length,
      executableMoveCount,
      preExecuteSkippedMoveCount: skippedResults.length,
      readinessGroupCount: readinessGroups.length,
      readyReadinessGroupCount,
      blockedReadinessGroupCount,
      readinessGroups,
      preExecuteSkipReasons: this.buildPreExecutionSkipReasons(skippedResults),
      preExecutionHandoffState,
      preExecuteReturnState,
    };
  }

  logPreExecutionHandoff(snapshot = {}) {
    this.logger.info(REBALANCER_LOG_MSG.PRE_EXECUTION_HANDOFF, {
      entityId: this.entityId,
      entityType: this.entityType,
      ...snapshot,
    });
  }

  async buildPreExecutionHandoffPlan(moves = [], context = {}) {
    const results = [];
    const readinessByNodeId = new Map();
    const getSkipReasonCached = async (nodeId) => {
      if (!nodeId) {
        return REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
      }
      if (readinessByNodeId.has(nodeId)) {
        return readinessByNodeId.get(nodeId);
      }
      const skipDetail = this.normalizePreExecutionSkipDetail(
        await this.getNodeReadinessSkipReason(nodeId),
      );
      readinessByNodeId.set(nodeId, skipDetail);
      return skipDetail;
    };
    const blockedAddNodeIds = new Set();
    for (const move of moves) {
      if (this.isShuttingDown) {
        const readinessGroups = this.buildPreExecutionReadinessGroups(
          moves,
          readinessByNodeId,
        );
        return {
          executableGroups: [],
          results,
          snapshot: this.buildPreExecutionHandoffSnapshot({
            moves,
            context,
            executableGroups: [],
            skippedResults: results,
            readinessGroups,
          }),
        };
      }
      if (
        (move?.type === MoveType.ADD || move?.type === MoveType.REPLACE) &&
        move?.nodeId &&
        this.shouldRequireMoveTargetReadiness(move)
      ) {
        const skipDetail = await getSkipReasonCached(move.nodeId);
        if (skipDetail !== REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE) {
          blockedAddNodeIds.add(move.nodeId);
        }
      }
    }

    const movesToExecute = [];
    for (const move of moves) {
      const isDeferrableRemove =
        move?.type === MoveType.REMOVE &&
        move?.reason !== MOVE_REASON.REPLICA_FAILED &&
        move?.standaloneSafe !== true;
      if (
        blockedAddNodeIds.size > UNIFIED_REBALANCER_LITERAL.ZERO &&
        isDeferrableRemove
      ) {
        results.push({
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.AWAITING_READY_ADD_CAPACITY,
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
        });
        continue;
      }
      movesToExecute.push(move);
    }

    const groupedMoves = this.groupMovesByTargetNode(movesToExecute);
    const executableGroups = [];
    for (const [nodeId, nodeMoves] of groupedMoves.entries()) {
      if (this.isShuttingDown) {
        break;
      }
      const strictNodeMoves = nodeMoves.filter((move) =>
        this.shouldRequireMoveTargetReadiness(move),
      );
      const skipDetail = nodeId && strictNodeMoves.length > NUM.ZERO ?
        await getSkipReasonCached(nodeId) :
        REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
      if (
        skipDetail !== REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE &&
        strictNodeMoves.length === nodeMoves.length
      ) {
        executableGroups.push({
          nodeId,
          nodeMoves,
          skipDetail,
          skipBeforeExecute: true,
        });
        continue;
      }
      executableGroups.push({
        nodeId,
        nodeMoves,
        skipDetail: REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE,
        skipBeforeExecute: false,
      });
    }

    const preExecuteSkippedResults = [
      ...results,
      ...executableGroups
        .filter((group) => group.skipBeforeExecute === true)
        .flatMap((group) => group.nodeMoves.map((move) => ({
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
          skipDetail: group.skipDetail,
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
        }))),
    ];
    const readinessGroups = this.buildPreExecutionReadinessGroups(
      moves,
      readinessByNodeId,
    );
    return {
      executableGroups,
      results,
      snapshot: this.buildPreExecutionHandoffSnapshot({
        moves,
        context,
        executableGroups: executableGroups.filter(
          (group) => group.skipBeforeExecute !== true,
        ),
        skippedResults: preExecuteSkippedResults,
        readinessGroups,
      }),
    };
  }
}

export {UnifiedRebalancerSegment4Stage4};
