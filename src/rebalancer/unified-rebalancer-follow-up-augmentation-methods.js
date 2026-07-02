import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';

const {
  MoveType,
  PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION,
  PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION_BY_STATE,
  PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE,
  PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE_TABLE,
  PRIORITY_RECOVERY_FOLLOW_UP_FIELD,
  REBALANCER_MOVE_FIELD,
  REBALANCER_TARGET_READINESS_MODE,
  UNIFIED_REBALANCER_LITERAL,
} = SHARED;
const {buildPriorityRecoveryBlockedPartitions} = SHARED.UNIFIED_REBALANCER_SHARED;

const FOLLOW_UP_AUGMENTATION_CONSTRUCTOR = 'constructor';

class UnifiedRebalancerFollowUpAugmentationMethods {
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
        followUpPartitionId.length > 0 &&
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
    if (explicitPartitionId.length > 0) {
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
      followUpPartitionId.length > 0 &&
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

  resolvePriorityRecoveryPlanningPriorityPartitionSummary(
    planningSnapshot = null,
  ) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }
    const directSummary = planningSnapshot.priorityPartitionSummary;
    if (directSummary && typeof directSummary === 'object') {
      return directSummary;
    }
    const recoveryGateSummary =
      planningSnapshot[PRIORITY_RECOVERY_FOLLOW_UP_FIELD
        .PUBLICATION_RECOVERY_GATE]?.priorityPartitionSummary;
    return recoveryGateSummary && typeof recoveryGateSummary === 'object' ?
      recoveryGateSummary :
      null;
  }

  hasCurrentPriorityRecoverySpreadGap(planningSnapshot = null) {
    if (
      !this.isControlPlanePriorityPartition() ||
      this.isPriorityControlPlaneRecoveryActive() !== true
    ) {
      return false;
    }
    const priorityPartitionSummary =
      this.resolvePriorityRecoveryPlanningPriorityPartitionSummary(
        planningSnapshot,
      );
    const blockedPartitions =
      buildPriorityRecoveryBlockedPartitions(priorityPartitionSummary);
    return blockedPartitions.some((partition) => {
      const partitionId = String(
        partition?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      const spreadGap = Number(partition?.spreadGap);
      return (
        partitionId === this.entityId &&
        Number.isFinite(spreadGap) &&
        spreadGap > 0
      );
    });
  }

  normalizeCurrentPriorityRecoverySpreadGapMoves(
    moves = [],
    planningSnapshot = null,
  ) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    if (!this.hasCurrentPriorityRecoverySpreadGap(planningSnapshot)) {
      return normalizedMoves;
    }
    return normalizedMoves.map((move) => {
      if (
        move?.type !== MoveType.ADD &&
        move?.type !== MoveType.REPLACE
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

  async resolvePriorityRecoveryFollowUpPlanningSnapshot(decision = null) {
    const decisionPlanningSnapshot = decision?.planningSnapshot || null;
    if (
      this.resolvePriorityRecoveryPlanningPriorityPartitionSummary(
        decisionPlanningSnapshot,
      )
    ) {
      return decisionPlanningSnapshot;
    }
    const livePlanningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot({
        partitionId: this.entityId,
      });
    return livePlanningSnapshot || decisionPlanningSnapshot;
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
    const planningSnapshot =
      await this.resolvePriorityRecoveryFollowUpPlanningSnapshot(decision);
    const currentRecoveryMoves =
      this.normalizeCurrentPriorityRecoverySpreadGapMoves(
        normalizedMoves,
        planningSnapshot,
      );
    const currentFollowUpPartitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    const currentFollowUpAlreadyPlanned =
      currentFollowUpPartitionId.length > 0 &&
      currentRecoveryMoves.some((move) =>
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
          currentRecoveryMoves,
          Object.freeze({
            followUpPartitionId: currentFollowUpPartitionId,
            followUpTargetsCurrentEntity: true,
          }),
        );
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
      followUpMove = this.buildPriorityRecoveryFollowUpMove({
        ...context,
        decision: this.buildPriorityRecoverySurrogateFollowUpDecision(
          planningSnapshot,
        ),
      });
    }
    if (!this.isPriorityRecoveryFollowUpMoveCreated(followUpMove)) {
      return currentRecoveryMoves;
    }
    const followUpPartitionId =
      this.resolvePriorityRecoveryCurrentFollowUpPartitionId(followUpMove);
    const augmentationEvidence =
      this.buildPriorityRecoveryFollowUpAugmentationEvidence({
        moves: currentRecoveryMoves,
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
      return this.prependPriorityRecoverySurrogateFollowUpMoves(
        [followUpMove, ...currentRecoveryMoves],
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
        currentRecoveryMoves,
        augmentationEvidence,
      );
    }
    return currentRecoveryMoves;
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
        surrogatePartitionId.length === 0 ||
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
    if (followUpMoves.length === 0) {
      return normalizedMoves;
    }
    return [...followUpMoves, ...normalizedMoves];
  }
}

function applyUnifiedRebalancerFollowUpAugmentationMethods(targetClass) {
  const sourcePrototype =
    UnifiedRebalancerFollowUpAugmentationMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === FOLLOW_UP_AUGMENTATION_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyUnifiedRebalancerFollowUpAugmentationMethods};
