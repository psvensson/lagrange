import {UnifiedRebalancerFollowUpMove} from './unified-rebalancer-follow-up-move.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';
import {
  canonicalizeRebalancerMove,
} from './rebalancer-entity-identity.js';

const {
  MOVE_REASON,
  MoveType,
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
  UNIFIED_REBALANCER_LITERAL,
} = SHARED;

const PRE_EXECUTION_MOVE_COUNT_FIELD_BY_TYPE = Object.freeze({
  [MoveType.ADD]: 'addLikeMoveCount',
  [MoveType.REPLACE]: 'addLikeMoveCount',
  [MoveType.REMOVE]: 'removeMoveCount',
});

function resolveCoordinatorMoveContext(rebalancer, move) {
  const {entityType, entityId} = canonicalizeRebalancerMove(move, rebalancer);
  return {
    partitionId: entityId,
    entityType,
    entityId,
  };
}

function buildCoordinatorOperationRequest(move, context) {
  return {
    type: move.operationType,
    partitionId: context.partitionId,
    entityType: context.entityType,
    entityId: context.entityId,
    nodeId: move.nodeId,
    replicaId: move.replicaId,
    sourceNodeId: move.sourceNodeId,
    moveReason: move.reason,
    enforceConcurrentOperationBudget: true,
  };
}

function buildCoordinatorCreationErrorResult(rebalancer, error, move) {
  if (error?.rebalanceSkipReason) {
    return rebalancer.buildSkippedMoveResult(
      error.rebalanceSkipReason,
      move,
      error.admissionResult ? {admission: error.admissionResult} : {},
    );
  }
  if (error?.admissionResult) {
    return rebalancer.buildSkippedMoveResult(
      error.admissionResult.decisionType ||
        UNIFIED_REBALANCER_LITERAL.ADMISSION_DENIED,
      move,
      {admission: error.admissionResult},
    );
  }
  throw error;
}

function incrementPreExecutionMoveGroup(current, move, nodeId) {
  const countField =
    PRE_EXECUTION_MOVE_COUNT_FIELD_BY_TYPE[move?.type] || 'otherMoveCount';
  return {
    ...current,
    nodeId,
    moveCount: current.moveCount + 1,
    [countField]: current[countField] + 1,
  };
}

function readPreExecutionSkipDetail(readinessByNodeId, nodeId) {
  return readinessByNodeId.has(nodeId) ?
    readinessByNodeId.get(nodeId) :
    REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
}

function isReadinessCheckedAddLikeMove(rebalancer, move) {
  return (
    (move?.type === MoveType.ADD || move?.type === MoveType.REPLACE) &&
    Boolean(move.nodeId) &&
    rebalancer.shouldRequireMoveTargetReadiness(move)
  );
}

function isDeferrableRemove(move) {
  return (
    move?.type === MoveType.REMOVE &&
    move?.reason !== MOVE_REASON.REPLICA_FAILED &&
    move?.standaloneSafe !== true
  );
}

function buildAwaitingReadyCapacityResult(move) {
  return {
    success: false,
    skipped: true,
    reason: REBALANCER_SKIP_REASON.AWAITING_READY_ADD_CAPACITY,
    operation: move.type,
    nodeId: move.nodeId,
    replicaId: move.replicaId,
  };
}

function partitionMovesByReadyAddCapacity(moves, blockedAddNodeIds) {
  const result = {movesToExecute: [], skippedResults: []};
  for (const move of moves) {
    if (blockedAddNodeIds.size > 0 && isDeferrableRemove(move)) {
      result.skippedResults.push(buildAwaitingReadyCapacityResult(move));
    } else {
      result.movesToExecute.push(move);
    }
  }
  return result;
}

function buildNodeNotReadyResult(move, skipDetail) {
  return {
    success: false,
    skipped: true,
    reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
    skipDetail,
    operation: move.type,
    nodeId: move.nodeId,
    replicaId: move.replicaId,
  };
}

async function readCachedNodeReadinessSkip(
  rebalancer,
  readinessByNodeId,
  nodeId,
) {
  if (!nodeId) {
    return REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
  }
  if (!readinessByNodeId.has(nodeId)) {
    const skipDetail = rebalancer.normalizePreExecutionSkipDetail(
      await rebalancer.getNodeReadinessSkipReason(nodeId),
    );
    readinessByNodeId.set(nodeId, skipDetail);
  }
  return readinessByNodeId.get(nodeId);
}

async function buildExecutableMoveGroups(
  rebalancer,
  groupedMoves,
  getSkipReason,
) {
  const executableGroups = [];
  for (const [nodeId, nodeMoves] of groupedMoves) {
    if (rebalancer.isShuttingDown) {
      break;
    }
    const strictNodeMoves = nodeMoves.filter((move) =>
      rebalancer.shouldRequireMoveTargetReadiness(move),
    );
    const skipDetail = nodeId && strictNodeMoves.length > 0 ?
      await getSkipReason(nodeId) :
      REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
    const skipBeforeExecute =
      skipDetail !== REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE &&
      strictNodeMoves.length === nodeMoves.length;
    executableGroups.push({
      nodeId,
      nodeMoves,
      skipDetail: skipBeforeExecute ?
        skipDetail :
        REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE,
      skipBeforeExecute,
    });
  }
  return executableGroups;
}

class UnifiedRebalancerMoveExecution extends UnifiedRebalancerFollowUpMove {
  async executeMoveViaCoordinator(move) {
    if (this.isShuttingDown) {
      return this.buildSkippedMoveResult(
        REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
        move,
      );
    }

    const operationContext = resolveCoordinatorMoveContext(this, move);
    const safetyError = await this.rebalanceCoordinator.getMoveSafetyError({
      ...move,
      ...operationContext,
    });
    if (safetyError) {
      this.logger.debug(REBALANCER_LOG_MSG.MOVE_BLOCKED_BY_SAFETY_POLICY, {
        entityId: this.entityId,
        entityType: this.entityType,
        partitionId: operationContext.partitionId,
        moveType: move.type,
        moveTargetNodeId: move.nodeId || null,
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

    const operationRequest = buildCoordinatorOperationRequest({
      ...move,
      operationType: this.resolveCoordinatorOperationType(move.type),
    }, operationContext);
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
      return buildCoordinatorCreationErrorResult(this, error, move);
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
    if (normalizedReplicaId.length === 0) {
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
    return nodeId.length > 0 ?
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
    const normalizedSkipDetail = typeof skipDetail === 'string' ?
      skipDetail.trim() :
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
    return normalizedSkipDetail.length > 0 ?
      normalizedSkipDetail :
      REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
  }

  buildPreExecutionReadinessGroups(moves = [], readinessByNodeId = new Map()) {
    const groupsByNodeId = new Map();
    for (const move of moves) {
      const nodeId = this.resolvePreExecutionReadinessNodeId(move);
      const current = groupsByNodeId.get(nodeId) || {
        nodeId,
        moveCount: 0,
        addLikeMoveCount: 0,
        removeMoveCount: 0,
        otherMoveCount: 0,
      };
      groupsByNodeId.set(
        nodeId,
        incrementPreExecutionMoveGroup(current, move, nodeId),
      );
    }

    return [...groupsByNodeId.values()].map((group) => {
      const skipDetail =
        readPreExecutionSkipDetail(readinessByNodeId, group.nodeId);
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
        .filter((reason) => reason.length > 0),
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
      0,
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
    const getSkipReasonCached = (nodeId) =>
      readCachedNodeReadinessSkip(this, readinessByNodeId, nodeId);
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
      if (isReadinessCheckedAddLikeMove(this, move)) {
        const skipDetail = await getSkipReasonCached(move.nodeId);
        if (skipDetail !== REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE) {
          blockedAddNodeIds.add(move.nodeId);
        }
      }
    }

    const {movesToExecute, skippedResults} =
      partitionMovesByReadyAddCapacity(moves, blockedAddNodeIds);
    results.push(...skippedResults);
    const groupedMoves = this.groupMovesByTargetNode(movesToExecute);
    const executableGroups = await buildExecutableMoveGroups(
      this,
      groupedMoves,
      getSkipReasonCached,
    );

    const preExecuteSkippedResults = [
      ...results,
      ...executableGroups
        .filter((group) => group.skipBeforeExecute === true)
        .flatMap((group) => group.nodeMoves.map((move) =>
          buildNodeNotReadyResult(move, group.skipDetail))),
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

export {UnifiedRebalancerMoveExecution};
