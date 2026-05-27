import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {
  REBALANCER_LOG_MSG,
  UNIFIED_REBALANCER_LITERAL,
} = UNIFIED_REBALANCER_SHARED;

const REBALANCER_EVALUATION_METHODS = {
  /**
   * Evaluate if rebalancing is needed.
   * @return {Promise<boolean>} True if rebalancing is needed.
   */
  async evaluateState() {
    const currentReplicas = this.getCurrentReplicas();
    const policy = await this.getPolicy();
    const availableNodes = this.getAvailableNodes();
    const assessment = this.movePlanner.assessState(
      currentReplicas,
      policy,
      availableNodes,
    );
    const {
      actionableTarget,
      critical,
      criticalReason,
      desiredTarget,
      healthyReplicas,
      suboptimal,
    } = assessment;

    this.logger.debug(REBALANCER_LOG_MSG.EVALUATING_STATE, {
      entityId: this.entityId,
      entityType: this.entityType,
      currentReplicaCount: currentReplicas.length,
      availableNodeCount: availableNodes.length,
      hasCache: !!this.systemTableCache,
      targetReplicaCount: desiredTarget,
      actionableTargetReplicaCount: actionableTarget,
    });

    let hasPriorityEligibleNodes = false;
    if (this.isControlPlanePriorityPartition()) {
      const decision = await this.getCurrentPriorityRecoveryFollowUpDecisionSnapshot();
      if (decision) {
        const eligibleNodeIds = this.resolvePriorityRecoveryFollowUpEligibleNodeIds(decision);
        if (eligibleNodeIds && eligibleNodeIds.length > 0) {
          hasPriorityEligibleNodes = true;
        }
      }
    }

    // Skip rebalancing if cache appears unpopulated (no nodes known)
    // This prevents newly joined nodes from making incorrect decisions
    // before their cache is synchronized with the cluster state
    if (availableNodes.length === UNIFIED_REBALANCER_LITERAL.ZERO && !hasPriorityEligibleNodes) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.lastSuboptimalSignal = null;
      return false;
    }

    if (
      await this.hasPriorityRecoveryFollowUpOperationRequired() ||
      await this.hasPriorityRecoverySurrogateFollowUpOperationRequired()
    ) {
      this.lastSuboptimalSignal = null;
      return true;
    }

    if (
      availableNodes.length < desiredTarget &&
      healthyReplicas.length >= actionableTarget
    ) {
      const degradedSignal = this.buildDegradedTargetSignal(
        availableNodes,
        desiredTarget,
        actionableTarget,
        healthyReplicas.length,
      );
      if (this.lastDegradedTargetSignal !== degradedSignal) {
        this.lastDegradedTargetSignal = degradedSignal;
        this.logger.info(REBALANCER_LOG_MSG.DEGRADED_TARGET, {
          entityId: this.entityId,
          entityType: this.entityType,
          availableNodeCount: availableNodes.length,
          desiredTargetReplicaCount: desiredTarget,
          actionableTargetReplicaCount: actionableTarget,
          healthyReplicaCount: healthyReplicas.length,
        });
      }
    } else {
      this.lastDegradedTargetSignal = null;
    }

    // Critical checks - trigger immediate rebalancing
    if (critical) {
      this.lastSuboptimalSignal = null;
      this.logger.warn(REBALANCER_LOG_MSG.CRITICAL_STATE, {
        entityId: this.entityId,
        entityType: this.entityType,
        reason: criticalReason,
      });
      return true;
    }

    // Opportunistic checks - can wait for periodic schedule
    if (suboptimal) {
      const suboptimalSignal = this.buildSuboptimalSignal(
        availableNodes,
        desiredTarget,
        actionableTarget,
        healthyReplicas.length,
      );
      if (this.lastSuboptimalSignal !== suboptimalSignal) {
        this.lastSuboptimalSignal = suboptimalSignal;
        this.logger.info(REBALANCER_LOG_MSG.SUBOPTIMAL_STATE, {
          entityId: this.entityId,
          entityType: this.entityType,
          availableNodeCount: availableNodes.length,
          desiredTargetReplicaCount: desiredTarget,
          actionableTargetReplicaCount: actionableTarget,
          healthyReplicaCount: healthyReplicas.length,
        });
      }
      return true;
    }

    this.lastSuboptimalSignal = null;
    return false;
  },

  /**
   * Build a stable signal for degraded-target logging dedupe.
   * @param {Array<Object>} availableNodes - Ready nodes currently visible.
   * @param {number} desiredTarget - Policy target replica count.
   * @param {number} actionableTarget - Target constrained by ready topology.
   * @param {number} healthyReplicaCount - Current healthy replica count.
   * @return {string} Stable topology signal.
   * @private
   */
  buildDegradedTargetSignal(
    availableNodes,
    desiredTarget,
    actionableTarget,
    healthyReplicaCount,
  ) {
    const nodeSignature = availableNodes
      .map((node) => node?.node_id || node?.id || '')
      .filter(Boolean)
      .sort()
      .join(',');
    return (
      `${nodeSignature}|${desiredTarget}|${actionableTarget}|` +
      `${healthyReplicaCount}`
    );
  },

  /**
   * Build a stable signal for suboptimal-state logging dedupe.
   * @param {Array<Object>} availableNodes - Ready nodes currently visible.
   * @param {number} desiredTarget - Policy target replica count.
   * @param {number} actionableTarget - Target constrained by ready topology.
   * @param {number} healthyReplicaCount - Current healthy replica count.
   * @return {string} Stable suboptimal-state signal.
   * @private
   */
  buildSuboptimalSignal(
    availableNodes,
    desiredTarget,
    actionableTarget,
    healthyReplicaCount,
  ) {
    const nodeSignature = availableNodes
      .map((node) => node?.node_id || node?.id || '')
      .filter(Boolean)
      .sort()
      .join(',');
    return (
      `${nodeSignature}|${desiredTarget}|${actionableTarget}|` +
      `${healthyReplicaCount}`
    );
  },

  /**
   * Check if current state is critical (requires immediate action).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is critical.
   */
  isCriticalState(replicas, policy, availableNodes = null) {
    return this.movePlanner.isCriticalState(replicas, policy, availableNodes);
  },

  /**
   * Get the reason for critical state.
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {string} Reason description.
   */
  getCriticalReason(replicas, policy, availableNodes = null) {
    return this.movePlanner.getCriticalReason(replicas, policy, availableNodes);
  },

  /**
   * Check if current state is suboptimal (can be improved).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is suboptimal.
   */
  isSuboptimalState(replicas, policy, availableNodes = null) {
    return this.movePlanner.isSuboptimalState(replicas, policy, availableNodes);
  },

  /**
   * Check if multiple replicas are on the same node.
   * @param {Array<Object>} replicas - Replicas to check.
   * @return {boolean} True if duplicates exist.
   */
  hasMultipleReplicasOnSameNode(replicas) {
    return this.movePlanner.hasMultipleReplicasOnSameNode(replicas);
  },

  /**
   * Get nodes that don't have a local replica.
   * @param {Array<Object>} replicas - Current replicas.
   * @return {Array<string>} Node IDs without local replicas.
   */
  getNodesWithoutLocalReplica(replicas) {
    return this.movePlanner.getNodesWithoutLocalReplica(replicas);
  },

  /**
   * Count moves that actually scheduled work (not skipped/deferred).
   * @param {Object} rebalanceResult - Result from rebalance().
   * @return {number} Number of actionable moves.
   * @private
   */
  countExecutedMoves(rebalanceResult) {
    if (!rebalanceResult || !Array.isArray(rebalanceResult.moves)) {
      return UNIFIED_REBALANCER_LITERAL.ZERO;
    }

    return rebalanceResult.moves.filter((move) => {
      if (!move || move.skipped) {
        return false;
      }
      return move.success !== false;
    }).length;
  },
};

export {REBALANCER_EVALUATION_METHODS};
