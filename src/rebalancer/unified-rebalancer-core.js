import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {UnifiedRebalancerRebalanceLoop} from './unified-rebalancer-rebalance-loop.js';
import {REBALANCER_EVALUATION_METHODS} from './rebalancer-evaluation-methods.js';
import {REBALANCER_NODE_EVENT_METHODS} from './rebalancer-node-event-methods.js';
import {REBALANCER_PLANNING_GATE_METHODS} from './rebalancer-planning-gate-methods.js';
import {REBALANCER_TRANSPORT_PRESSURE_METHODS} from './rebalancer-transport-pressure-methods.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as FOLLOW_UP_SHARED} from './unified-rebalancer-follow-up-shared.js';

const {REBALANCER_LOG_MSG} = UNIFIED_REBALANCER_SHARED;
const {
  UNIFIED_REBALANCER_LITERAL,
} = FOLLOW_UP_SHARED;

class UnifiedRebalancerCore extends UnifiedRebalancerRebalanceLoop {
  buildPriorityRecoveryVisibilityRebalanceDecision(event = {}, options = {}) {
    const baseDecision =
      super.buildPriorityRecoveryVisibilityRebalanceDecision(event, options);
    const publicationEventScheduling =
      this.buildPriorityRecoveryPublicationEventSchedulingSnapshot(
        event,
        options,
      );

    return Object.freeze({
      ...baseDecision,
      shouldEnqueue:
        baseDecision.shouldEnqueue === true ||
        publicationEventScheduling.shouldEnqueue === true,
      visibilityProgress:
        baseDecision.visibilityProgress === true ||
        publicationEventScheduling.visibilityProgress === true,
      publicationEventScheduling,
    });
  }

  buildPriorityRecoveryFollowUpAugmentationEvidence({
    moves = [],
    followUpMove = null,
  } = {}) {
    const baseEvidence =
      super.buildPriorityRecoveryFollowUpAugmentationEvidence({
        moves,
        followUpMove,
      });
    const followUpPartitionId = String(
      baseEvidence.followUpPartitionId ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    const currentFollowUpAlreadyPlanned =
      followUpPartitionId.length > 0 &&
      normalizedMoves.some((move) =>
        this.isPriorityRecoveryCurrentFollowUpMove(
          move,
          followUpPartitionId,
        ),
      );

    return Object.freeze({
      ...baseEvidence,
      hasAddLikeCalculatedMove: currentFollowUpAlreadyPlanned,
      followUpTargetsCurrentEntity:
        followUpPartitionId.length > 0 &&
        followUpPartitionId === this.entityId,
    });
  }

  getStats() {
    const stats = {
      entityId: this.entityId,
      entityType: this.entityType,
      isLeader: this.isLeader,
      lastRebalanceTime: this.lastRebalanceTime,
      rebalanceCount: this.rebalanceCount,
      currentInterval: this.currentInterval,
      initialized: this.initialized,
      usingCoordinator: !!this.rebalanceCoordinator,
    };

    return stats;
  }

  async getStatsAsync() {
    const stats = this.getStats();

    if (this.rebalanceCoordinator && this.rebalanceCoordinator.getStats) {
      const coordStats = await this.rebalanceCoordinator.getStats();
      stats.coordinatorStats = {
        inFlightOperations: coordStats.inFlightOperations,
        operationsCreated: coordStats.operationsCreated,
        operationsCompleted: coordStats.operationsCompleted,
        operationsFailed: coordStats.operationsFailed,
      };
    }

    return stats;
  }

  shutdown() {
    this.isShuttingDown = true;
    this.isLeader = false;
    this.cancelScheduledCheck();
    this.rebalanceCheckQueue.shutdown();
    this.cancelStabilizationTimer();
    this.unbindCoordinatorProgressListeners();
    this.unbindPriorityRecoveryVisibilityCacheListener();
    this.lastStateChangeTime = null;
    this.initialized = false;

    this.logger.info(REBALANCER_LOG_MSG.SHUTDOWN, {
      entityId: this.entityId,
      entityType: this.entityType,
    });
  }
}

Object.assign(
  UnifiedRebalancerCore.prototype,
  REBALANCER_PLANNING_GATE_METHODS,
  REBALANCER_TRANSPORT_PRESSURE_METHODS,
  REBALANCER_EVALUATION_METHODS,
  REBALANCER_NODE_EVENT_METHODS,
);

export {UnifiedRebalancerCore};
