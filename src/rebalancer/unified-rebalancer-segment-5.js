import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {UnifiedRebalancerSegment4} from './unified-rebalancer-segment-4.js';
import {REBALANCER_EVALUATION_METHODS} from './rebalancer-evaluation-methods.js';
import {REBALANCER_NODE_EVENT_METHODS} from './rebalancer-node-event-methods.js';
import {REBALANCER_PLANNING_GATE_METHODS} from './rebalancer-planning-gate-methods.js';
import {REBALANCER_TRANSPORT_PRESSURE_METHODS} from './rebalancer-transport-pressure-methods.js';
import {UNIFIED_REBALANCER_SEGMENT_4_STAGE_SHARED as STAGE_SHARED} from './unified-rebalancer-segment-4-stage-shared.js';

const {REBALANCER_LOG_MSG} = UNIFIED_REBALANCER_SHARED;
const {
  NUM,
  UNIFIED_REBALANCER_LITERAL,
} = STAGE_SHARED;

class UnifiedRebalancerSegment5 extends UnifiedRebalancerSegment4 {
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
      followUpPartitionId.length > NUM.ZERO &&
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
        followUpPartitionId.length > NUM.ZERO &&
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
  UnifiedRebalancerSegment5.prototype,
  REBALANCER_PLANNING_GATE_METHODS,
  REBALANCER_TRANSPORT_PRESSURE_METHODS,
  REBALANCER_EVALUATION_METHODS,
  REBALANCER_NODE_EVENT_METHODS,
);

export {UnifiedRebalancerSegment5};
