import {UnifiedRebalancerMoveExecution} from './unified-rebalancer-move-execution.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';

const {
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_PRE_EXECUTION_RETURN_STATE,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  TriggerType,
  UNIFIED_REBALANCER_LITERAL,
} = SHARED;

class UnifiedRebalancerRebalanceLoop extends UnifiedRebalancerMoveExecution {
  async executeRebalancingMoves(moves, context = {}) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    const batchSize =
      Number.isFinite(this.moveBatchSize) && this.moveBatchSize > 0 ?
        Math.floor(this.moveBatchSize) :
        1;
    const interBatchDelayMs =
      Number.isFinite(this.interBatchDelayMs) && this.interBatchDelayMs > 0 ?
        this.interBatchDelayMs :
        0;
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
      const {nodeId, nodeMoves, skipBeforeExecute, skipDetail} = group;
      const groupHasDeferredTargetReadiness = nodeMoves.some((move) =>
        !this.shouldRequireMoveTargetReadiness(move),
      );
      if (this.isShuttingDown) {
        break;
      }
      if (skipBeforeExecute === true) {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_BATCH_UNREADY, {
          entityId: this.entityId,
          nodeId,
          moveCount: nodeMoves.length,
          skipDetail,
        });
        for (const move of nodeMoves) {
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
        continue;
      }

      for (
        let i = UNIFIED_REBALANCER_LITERAL.ZERO;
        i < nodeMoves.length;
        i += batchSize
      ) {
        if (this.isShuttingDown) {
          break;
        }
        const batch = nodeMoves.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((move) => {
            return this.executeMove(move);
          }),
        );

        results.push(...batchResults);

        if (nodeId && groupHasDeferredTargetReadiness !== true) {
          const midBatchSkip = await this.getNodeReadinessSkipReason(nodeId);
          if (midBatchSkip !== null) {
            this.logger.debug(REBALANCER_LOG_MSG.NODE_DISCONNECTED_BATCH, {
              entityId: this.entityId,
              nodeId,
              remainingMoves: nodeMoves.length - (i + batch.length),
              skipDetail: midBatchSkip,
            });
            const remainingMoves = nodeMoves.slice(i + batch.length);
            for (const move of remainingMoves) {
              results.push({
                success: false,
                skipped: true,
                reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
                skipDetail: midBatchSkip,
                operation: move.type,
                nodeId: move.nodeId,
                replicaId: move.replicaId,
              });
            }
            break;
          }
        }

        if (
          interBatchDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO &&
          i + batchSize < nodeMoves.length
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, interBatchDelayMs),
          );
        }
      }
    }

    return results;
  }

  async rebalance(trigger = TriggerType.PERIODIC, policy = null) {
    if (this.isShuttingDown) {
      return this.buildRebalanceResult(false, {
        skipped: true,
        reason: REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
      });
    }

    if (!this.isLeader) {
      this.logger.debug(REBALANCER_LOG_MSG.NOT_LEADER_SKIP, {
        entityId: this.entityId,
      });
      return this.buildRebalanceResult(false, {
        reason: REBALANCER_RUNTIME_REASON.NOT_LEADER,
      });
    }

    const effectivePolicy = policy || (await this.getPolicy());
    const inventorySourceStateBefore =
      this.movePlanner.captureReplicaInventorySourceState();
    const currentReplicas = this.getCurrentReplicas();
    const availableNodes = this.getAvailableNodes();
    if (availableNodes.length === UNIFIED_REBALANCER_LITERAL.ZERO) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      return this.buildRebalanceResult(false, {
        reason: REBALANCER_RUNTIME_REASON.NO_AVAILABLE_NODES,
      });
    }

    const targetState = await this.movePlanner.calculateTargetState(
      currentReplicas,
      effectivePolicy,
      inventorySourceStateBefore,
    );
    const planningMembershipPublicationEpoch =
      this.resolvePublishedMembershipPlanningEpoch();
    const calculatedMoves = this.movePlanner.calculateMoves(
      currentReplicas,
      targetState,
    );
    const priorityRecoveryAwareMoves =
      await this.augmentMovesWithPriorityRecoveryFollowUp(calculatedMoves, {
        currentReplicas,
        targetState,
      });
    const moves = await this.movePlanner.applyPressureGating(
      priorityRecoveryAwareMoves,
    );

    if (moves.length === UNIFIED_REBALANCER_LITERAL.ZERO) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_REBALANCE_NEEDED, {
        entityId: this.entityId,
        currentCount: currentReplicas.length,
        targetCount: targetState.targetReplicaCount,
      });
      return this.buildRebalanceResult(true, {
        moves: [],
        reason: REBALANCER_RUNTIME_REASON.NO_CHANGES_NEEDED,
      });
    }

    const ordinaryPriorityRecoverySerialGate =
      await this.getOrdinaryPriorityRecoverySerialGateSnapshot(moves);
    if (ordinaryPriorityRecoverySerialGate?.blocked === true) {
      return this.buildRebalanceResult(true, {
        skipped: true,
        reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
        moves: [],
        ordinaryPriorityRecoverySerialGate,
      });
    }

    let availableBudget = this.maxConcurrentMoves;
    const shouldPrioritizeBudgetedTopologyCleanup =
      this.hasPriorityTopologyCleanupBudgetBypassCandidateMove(moves);
    try {
      const configuredBudget = await this.getConfiguredRebalanceBudget();
      const inFlightCount = await this.getGlobalInFlightOperationCount();
      const isCritical = this.movePlanner.isCriticalState(
        currentReplicas,
        effectivePolicy,
        availableNodes,
      );
      const effectiveBudget = isCritical ?
        configuredBudget * this.criticalBudgetMultiplier :
        configuredBudget;
      const reservedPriorityRecoveryMoveSlots =
        this.getReservedPriorityRecoveryMoveSlots();

      availableBudget = Math.max(
        0,
        effectiveBudget - inFlightCount - reservedPriorityRecoveryMoveSlots,
      );
      if (availableBudget <= UNIFIED_REBALANCER_LITERAL.ZERO) {
        const priorityTopologyCleanupBudgetBypass =
          shouldPrioritizeBudgetedTopologyCleanup;
        if (priorityTopologyCleanupBudgetBypass === true) {
          availableBudget = 1;
        } else {
          const priorityBudgetBypass =
            await this.canBypassGlobalBudgetForPriorityRecovery(moves);
          if (priorityBudgetBypass === true) {
            availableBudget = 1;
          } else {
            return this.buildRebalanceResult(true, {
              skipped: true,
              reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
              moves: [],
            });
          }
        }
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
      0,
      Math.min(this.maxConcurrentMoves, availableBudget),
    );
    const budgetOrderedMoves = shouldPrioritizeBudgetedTopologyCleanup ?
      this.prioritizePriorityTopologyCleanupMoves(moves) :
      moves;
    const limitedMoves = budgetOrderedMoves.slice(0, moveLimit).map((move) => {
      if (
        !Number.isInteger(planningMembershipPublicationEpoch) ||
        planningMembershipPublicationEpoch < 0
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

    this.lastRebalanceTime = Date.now();
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
      Date.now(),
    );
  }
}

export {UnifiedRebalancerRebalanceLoop};
