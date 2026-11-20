import {UnifiedRebalancerMoveExecution} from './unified-rebalancer-move-execution.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';
import {
  canonicalizeRebalancerMove,
} from './rebalancer-entity-identity.js';
import {
  isBoundMembershipPublicationEpoch,
} from './replica-operation-membership-epoch-binding.js';
import {isGroupRetiringInView} from
  '../partition/group-retirement-evidence.js';

const {
  EntityType,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_PRE_EXECUTION_RETURN_STATE,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  TriggerType,
  UNIFIED_REBALANCER_LITERAL,
} = SHARED;

// Whether this rebalancer's partition is a group its durable workflow record
// retires as a unit (group-retirement-evidence.js), as its view holds it.
function isEntityGroupRetiring(rebalancer) {
  return isGroupRetiringInView(rebalancer.systemTableCache,
    rebalancer.entityId);
}

function resolveLedgerSurplusDrainTargetState(
  targetState,
  ledgerSurplusDrainPlanningCapability,
) {
  if (!ledgerSurplusDrainPlanningCapability) {
    return targetState;
  }
  // The concentration owner authorizes exactly one operation for this
  // state: a count-decreasing ledger surplus drain whose retained target
  // nodes came from the admission owner's authoritative voter placement.
  // Its minting evidence is the authorization, REGARDLESS of how many nodes
  // the READY projection reports. Keep the generic placement diagnostics
  // and inventory snapshot; only the target state is retargeted.
  return Object.freeze({
    ...targetState,
    targetReplicaCount:
      ledgerSurplusDrainPlanningCapability.targetReplicaCount,
    targetNodes: Object.freeze([
      ...ledgerSurplusDrainPlanningCapability.targetNodeIds,
    ]),
    degraded: false,
    degradedReason: null,
    noReadyNodePlanningKind: ledgerSurplusDrainPlanningCapability.kind,
  });
}

function resolveBatchExecutionConfig(rebalancer) {
  const batchSize =
    Number.isFinite(rebalancer.moveBatchSize) && rebalancer.moveBatchSize > 0 ?
      Math.floor(rebalancer.moveBatchSize) :
      1;
  const interBatchDelayMs =
    Number.isFinite(rebalancer.interBatchDelayMs) &&
    rebalancer.interBatchDelayMs > 0 ?
      rebalancer.interBatchDelayMs :
      0;
  return {batchSize, interBatchDelayMs};
}

function appendSkippedNodeMoves(results, moves, skipDetail) {
  for (const move of moves) {
    results.push({
      success: false,
      skipped: true,
      reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
      skipDetail,
      operation: move.type,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
    });
  }
}

async function checkMidBatchNodeReadinessSkip(
  rebalancer,
  nodeId,
  groupHasDeferredTargetReadiness,
  nodeMoves,
  nextIndex,
  results,
) {
  if (!nodeId || groupHasDeferredTargetReadiness === true) {
    return false;
  }
  const midBatchSkip = await rebalancer.getNodeReadinessSkipReason(nodeId);
  if (midBatchSkip === null) {
    return false;
  }
  const remainingMoves = nodeMoves.slice(nextIndex);
  rebalancer.logger.debug(REBALANCER_LOG_MSG.NODE_DISCONNECTED_BATCH, {
    entityId: rebalancer.entityId,
    nodeId,
    remainingMoves: remainingMoves.length,
    skipDetail: midBatchSkip,
  });
  appendSkippedNodeMoves(results, remainingMoves, midBatchSkip);
  return true;
}

async function executeGroupMoveBatches(
  rebalancer,
  group,
  batchSize,
  interBatchDelayMs,
  results,
) {
  const {nodeId, nodeMoves} = group;
  const groupHasDeferredTargetReadiness = nodeMoves.some(
    (move) => !rebalancer.shouldRequireMoveTargetReadiness(move),
  );
  for (
    let i = UNIFIED_REBALANCER_LITERAL.ZERO;
    i < nodeMoves.length;
    i += batchSize
  ) {
    if (rebalancer.isShuttingDown) {
      break;
    }
    const batch = nodeMoves.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((move) => rebalancer.executeMove(move)),
    );
    results.push(...batchResults);
    if (
      await checkMidBatchNodeReadinessSkip(
        rebalancer,
        nodeId,
        groupHasDeferredTargetReadiness,
        nodeMoves,
        i + batch.length,
        results,
      )
    ) {
      break;
    }
    if (
      interBatchDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO &&
      i + batchSize < nodeMoves.length
    ) {
      await new Promise((resolve) => setTimeout(resolve, interBatchDelayMs));
    }
  }
}

function resolveRebalancePreflightRefusal(rebalancer) {
  if (rebalancer.isShuttingDown) {
    return rebalancer.buildRebalanceResult(false, {
      skipped: true,
      reason: REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
    });
  }
  if (!rebalancer.isLeader) {
    rebalancer.logger.debug(REBALANCER_LOG_MSG.NOT_LEADER_SKIP, {
      entityId: rebalancer.entityId,
    });
    return rebalancer.buildRebalanceResult(false, {
      reason: REBALANCER_RUNTIME_REASON.NOT_LEADER,
    });
  }
  const membershipChangeRefusal = rebalancer.messageGroupMembershipChangeRefusal();
  if (membershipChangeRefusal !== null) {
    return membershipChangeRefusal;
  }
  if (isEntityGroupRetiring(rebalancer)) {
    return rebalancer.buildRebalanceResult(true, {
      skipped: true,
      moves: [],
      reason: REBALANCER_SKIP_REASON.GROUP_RETIRING,
    });
  }
  return null;
}

async function resolveZeroBudgetBypassAllowance(
  rebalancer,
  moves,
  shouldPrioritizeBudgetedTopologyCleanup,
) {
  if (shouldPrioritizeBudgetedTopologyCleanup === true) {
    return true;
  }
  return (await rebalancer.canBypassGlobalBudgetForPriorityRecovery(moves)) === true;
}

async function computeRebalanceAvailableBudget(
  rebalancer,
  moves,
  currentReplicas,
  effectivePolicy,
  availableNodes,
  shouldPrioritizeBudgetedTopologyCleanup,
) {
  const configuredBudget = await rebalancer.getConfiguredRebalanceBudget();
  const inFlightCount = await rebalancer.getGlobalInFlightOperationCount();
  const isCritical = rebalancer.movePlanner.isCriticalState(
    currentReplicas,
    effectivePolicy,
    availableNodes,
  );
  const effectiveBudget = isCritical ?
    configuredBudget * rebalancer.criticalBudgetMultiplier :
    configuredBudget;
  const reservedPriorityRecoveryMoveSlots =
    rebalancer.getReservedPriorityRecoveryMoveSlots();
  const availableBudget = Math.max(
    0,
    effectiveBudget - inFlightCount - reservedPriorityRecoveryMoveSlots,
  );
  if (availableBudget > UNIFIED_REBALANCER_LITERAL.ZERO) {
    return availableBudget;
  }
  const allowZeroBudgetBypass = await resolveZeroBudgetBypassAllowance(
    rebalancer,
    moves,
    shouldPrioritizeBudgetedTopologyCleanup,
  );
  return allowZeroBudgetBypass ? 1 : 0;
}

async function planRebalanceCycleMoves(
  rebalancer,
  effectivePolicy,
  evaluationContext,
) {
  const inventorySourceStateBefore =
    rebalancer.movePlanner.captureReplicaInventorySourceState();
  const currentReplicas = rebalancer.getCurrentReplicas();
  const availableNodes = rebalancer.getAvailableNodes();
  const operationCreationGate =
    rebalancer.resolvePriorityRecoveryOperationCreationPlanningGateForEvaluation(
      evaluationContext,
    );
  const ledgerSurplusDrainPlanningCapability =
    operationCreationGate?.ledgerSurplusDrainPlanningCapability || null;
  if (
    availableNodes.length === UNIFIED_REBALANCER_LITERAL.ZERO &&
    !ledgerSurplusDrainPlanningCapability
  ) {
    rebalancer.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
      entityId: rebalancer.entityId,
      entityType: rebalancer.entityType,
    });
    return {
      earlyResult: rebalancer.buildRebalanceResult(false, {
        reason: REBALANCER_RUNTIME_REASON.NO_AVAILABLE_NODES,
      }),
    };
  }
  const calculatedTargetState = await rebalancer.movePlanner.calculateTargetState(
    currentReplicas,
    effectivePolicy,
    inventorySourceStateBefore,
  );
  const targetState = resolveLedgerSurplusDrainTargetState(
    calculatedTargetState,
    ledgerSurplusDrainPlanningCapability,
  );
  const planningMembershipPublicationEpoch =
    rebalancer.resolvePublishedMembershipPlanningEpoch();
  await rebalancer.refreshFailedCreateTargetCleanupDecisions();
  const calculatedMoves = rebalancer.movePlanner.calculateMoves(
    currentReplicas,
    targetState,
    {membershipPublicationEpoch: planningMembershipPublicationEpoch},
  );
  const priorityRecoveryAwareMoves =
    await rebalancer.augmentMovesWithPriorityRecoveryFollowUp(calculatedMoves, {
      currentReplicas,
      targetState,
    });
  const moves = (
    await rebalancer.movePlanner.applyPressureGating(priorityRecoveryAwareMoves)
  ).map((move) => canonicalizeRebalancerMove(move, rebalancer));
  if (moves.length === UNIFIED_REBALANCER_LITERAL.ZERO) {
    rebalancer.logger.debug(REBALANCER_LOG_MSG.NO_REBALANCE_NEEDED, {
      entityId: rebalancer.entityId,
      currentCount: currentReplicas.length,
      targetCount: targetState.targetReplicaCount,
    });
    return {
      earlyResult: rebalancer.buildRebalanceResult(true, {
        moves: [],
        reason: REBALANCER_RUNTIME_REASON.NO_CHANGES_NEEDED,
      }),
    };
  }
  const ordinaryPriorityRecoverySerialGate =
    await rebalancer.getOrdinaryPriorityRecoverySerialGateSnapshot(moves);
  if (ordinaryPriorityRecoverySerialGate?.blocked === true) {
    return {
      earlyResult: rebalancer.buildRebalanceResult(true, {
        skipped: true,
        reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
        moves: [],
        ordinaryPriorityRecoverySerialGate,
      }),
    };
  }
  return {
    earlyResult: null,
    currentReplicas,
    availableNodes,
    targetState,
    planningMembershipPublicationEpoch,
    moves,
  };
}

class UnifiedRebalancerRebalanceLoop extends UnifiedRebalancerMoveExecution {
  /**
   * The one planning refusal for message groups (owner decision 2026-10-04):
   * their replica membership does not change - no ADD, REPLACE or MOVE is
   * planned, so no operation is minted and no CREATE_REPLICA dispatched -
   * until the fresh-identity ADD/promote path for message groups exists.
   * The outcome is unsatisfiable until that capability ships, so it parks:
   * logged once per planner, never retried on a timer: checkRebalance
   * returns on it before evaluating and schedules no further check.
   * @return {Object|null} The typed refusal for a message group, else null.
   */
  messageGroupMembershipChangeRefusal() {
    if (this.entityType !== EntityType.MESSAGE_GROUP) {
      return null;
    }
    const reason =
      REBALANCER_SKIP_REASON.MESSAGE_GROUP_MEMBERSHIP_CHANGE_UNSUPPORTED;
    if (this.messageGroupMembershipChangeParked !== true) {
      this.messageGroupMembershipChangeParked = true;
      this.logger.warn(
        REBALANCER_LOG_MSG.MESSAGE_GROUP_MEMBERSHIP_CHANGE_PARKED,
        {entityId: this.entityId, entityType: this.entityType, reason},
      );
    }
    return this.buildRebalanceResult(true, {
      skipped: true,
      parked: true,
      reason,
      moves: [],
    });
  }

  /**
   * Whether this planner is parked (checkRebalance returns before any
   * evaluation and schedules no further check): a message group's, until
   * the fresh-identity ADD path exists.
   * @return {boolean}
   */
  isPlanningParked() {
    return this.messageGroupMembershipChangeRefusal() !== null;
  }

  async executeRebalancingMoves(moves, context = {}) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    const {batchSize, interBatchDelayMs} = resolveBatchExecutionConfig(this);
    const handoffPlan = await this.buildPreExecutionHandoffPlan(
      normalizedMoves,
      context,
    );
    this.logPreExecutionHandoff(handoffPlan.snapshot);
    const results = [...handoffPlan.results];
    if (
      handoffPlan.snapshot.preExecuteReturnState ===
        REBALANCER_PRE_EXECUTION_RETURN_STATE.RETURN_NO_LIMITED_MOVES ||
      handoffPlan.snapshot.preExecuteReturnState ===
        REBALANCER_PRE_EXECUTION_RETURN_STATE.RETURN_SHUTDOWN
    ) {
      return results;
    }

    for (const group of handoffPlan.executableGroups) {
      if (this.isShuttingDown) {
        break;
      }
      if (group.skipBeforeExecute === true) {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_BATCH_UNREADY, {
          entityId: this.entityId,
          nodeId: group.nodeId,
          moveCount: group.nodeMoves.length,
          skipDetail: group.skipDetail,
        });
        appendSkippedNodeMoves(results, group.nodeMoves, group.skipDetail);
        continue;
      }

      await executeGroupMoveBatches(
        this,
        group,
        batchSize,
        interBatchDelayMs,
        results,
      );
    }

    return results;
  }

  async rebalance(
    trigger = TriggerType.PERIODIC,
    policy = null,
    evaluationContext = null,
  ) {
    const preflightRefusal = resolveRebalancePreflightRefusal(this);
    if (preflightRefusal !== null) {
      return preflightRefusal;
    }

    const effectivePolicy = policy || (await this.getPolicy());
    const plannedCycle = await planRebalanceCycleMoves(
      this,
      effectivePolicy,
      evaluationContext,
    );
    if (plannedCycle.earlyResult !== null) {
      return plannedCycle.earlyResult;
    }
    const {
      currentReplicas,
      availableNodes,
      targetState,
      planningMembershipPublicationEpoch,
      moves,
    } = plannedCycle;

    let availableBudget = this.maxConcurrentMoves;
    const shouldPrioritizeBudgetedTopologyCleanup =
      this.hasPriorityTopologyCleanupBudgetBypassCandidateMove(moves);
    try {
      availableBudget = await computeRebalanceAvailableBudget(
        this,
        moves,
        currentReplicas,
        effectivePolicy,
        availableNodes,
        shouldPrioritizeBudgetedTopologyCleanup,
      );
      if (availableBudget <= UNIFIED_REBALANCER_LITERAL.ZERO) {
        return this.buildRebalanceResult(true, {
          skipped: true,
          reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          moves: [],
        });
      }
    } catch (error) {
      this.logger.warn(REBALANCER_LOG_MSG.REBALANCE_ERROR, {
        entityId: this.entityId,
        error: error.message,
      });
      return this.buildRebalanceResult(false, {
        skipped: true,
        reason: REBALANCER_SKIP_REASON.BUDGET_QUERY_FAILED,
        moves: [],
      });
    }

    this.logger.info(REBALANCER_LOG_MSG.START_REBALANCE, {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      moveCount: moves.length,
      currentCount: currentReplicas.length,
      targetCount: targetState.targetReplicaCount,
    });

    const moveLimit = Math.max(
      UNIFIED_REBALANCER_LITERAL.ZERO,
      Math.min(this.maxConcurrentMoves, availableBudget),
    );
    const budgetOrderedMoves = shouldPrioritizeBudgetedTopologyCleanup ?
      this.prioritizePriorityTopologyCleanupMoves(moves) :
      this.prioritizeOperationLedgerQuorumCureMoves(moves);
    const limitedMoves = budgetOrderedMoves.slice(0, moveLimit).map((move) => {
      if (
        !isBoundMembershipPublicationEpoch(planningMembershipPublicationEpoch)
      ) {
        return move;
      }
      return {
        ...move,
        membershipPublicationEpoch: planningMembershipPublicationEpoch,
      };
    });
    const results = await this.executeRebalancingMoves(limitedMoves, {
      trigger,
      plannedMoveCount: moves.length,
      moveLimit,
    });

    // The planning cycle's own clock. This owner holds nowFn; reading the
    // ambient one here made a deterministic node's cycle depend on host time.
    this.lastRebalanceTime = this.nowFn();
    this.rebalanceCount++;

    this.emit(REBALANCER_EVENT.REBALANCE_COMPLETE, {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      results,
    });

    return this.buildRebalanceResult(true, {
      moves: results,
      trigger,
      timestamp: this.lastRebalanceTime,
    });
  }

  resolvePublishedMembershipPlanningEpoch() {
    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      typeof readinessService.getCurrentPublishedMembershipEpochSync !==
        'function'
    ) {
      return null;
    }
    return readinessService.getCurrentPublishedMembershipEpochSync(
      this.nodeId,
      this.nowFn(),
    );
  }
}

export {UnifiedRebalancerRebalanceLoop};
