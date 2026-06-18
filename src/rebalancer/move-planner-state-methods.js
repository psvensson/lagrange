const LOCAL_STR_CONSTRUCTOR = 'constructor';

function createMovePlannerStateMethods(deps = {}) {
  const {
    ADJUST_DIRECTION,
    EntityType,
    MOVE_PLANNER_LITERAL,
    MOVE_PLANNER_REBALANCE_REASON,
    NUM,
    ReplicaStatus,
    SYSTEM_TABLE_NAME,
    WORKFLOW_STEP,
    adjustToOddCount,
    applyAdditionalRebalancingReason,
    buildPartitionDescriptorEpochDecision,
    buildReplicaCountPolicyDecision,
    getNextOddCount,
    getPartitionRowFromCache,
    getPreviousOddCount,
    isOddReplicaCount,
    isPriorityControlPlanePartition,
    isSystemTablePartition,
  } = deps;

  class MovePlannerStateMethods {
    /**
     * Validate and adjust replica count to an entity-safe target.
     * Raft-backed entities require odd replica counts; runtime services do not.
     * @param {number} count
     * @param {Object} policy
     * @return {number}
     */
    validateReplicaCount(count, policy) {
      const defaultMin =
        this.entityType === EntityType.RUNTIME_SERVICE ? NUM.ONE : NUM.THREE;
      const defaultMax = this.entityType === EntityType.RUNTIME_SERVICE ?
        Math.max(defaultMin, count || defaultMin) :
        NUM.SEVEN;
      const min = policy.minReplicaCount || defaultMin;
      const max = policy.maxReplicaCount || defaultMax;
      let adjusted = Math.max(min, Math.min(max, count));
      if (this.entityType === EntityType.RUNTIME_SERVICE) {
        return adjusted;
      }
      if (!isOddReplicaCount(adjusted)) {
        adjusted = adjustToOddCount(adjusted, ADJUST_DIRECTION.UP);
        if (adjusted > max) {
          adjusted = adjustToOddCount(count, ADJUST_DIRECTION.DOWN);
        }
      }
      return adjusted;
    }

    /**
     * Get desired replica target from policy.
     * @param {Object} policy
     * @return {number}
     */
    getPolicyTargetReplicaCount(policy) {
      const defaultTarget =
        this.entityType === EntityType.RUNTIME_SERVICE ? NUM.ONE : NUM.THREE;
      return policy.targetReplicaCount || policy.replicaCount || defaultTarget;
    }

    /**
     * Get actionable target based on currently available ready nodes.
     * @param {Object} policy
     * @param {Array<Object>} availableNodes
     * @return {number}
     */
    getActionableTargetReplicaCount(policy, availableNodes) {
      const desiredTarget = this.getPolicyTargetReplicaCount(policy);
      const availableCount = Array.isArray(availableNodes) ?
        availableNodes.length :
        NUM.ZERO;
      return Math.min(desiredTarget, availableCount);
    }

    /**
     * Calculate target replica count based on policy and current state.
     * @param {Array<Object>} currentReplicas
     * @param {Object} policy
     * @return {number}
     */
    calculateTargetReplicaCount(currentReplicas, policy) {
      const healthyCount = this.getHealthyReplicas(currentReplicas).length;
      const targetCount = this.getPolicyTargetReplicaCount(policy);
      const minCount = policy.minReplicaCount || NUM.THREE;
      const maxCount = policy.maxReplicaCount || NUM.SEVEN;
      if (this.entityType === EntityType.RUNTIME_SERVICE) {
        return this.validateReplicaCount(targetCount, policy);
      }
      const validTarget = this.validateReplicaCount(targetCount, policy);
      if (healthyCount < minCount) {
        return this.validateReplicaCount(minCount, policy);
      }
      if (healthyCount > maxCount) {
        return this.validateReplicaCount(maxCount, policy);
      }
      if (healthyCount < validTarget) {
        const nextCount = getNextOddCount(healthyCount, maxCount);
        return Math.min(nextCount, validTarget);
      }
      if (healthyCount > validTarget) {
        const prevCount = getPreviousOddCount(healthyCount, minCount);
        return Math.max(prevCount, validTarget);
      }
      return validTarget;
    }

    /**
     * Check if multiple replicas are on the same node.
     * @param {Array<Object>} replicas
     * @return {boolean}
     */
    hasMultipleReplicasOnSameNode(replicas) {
      const nodeIds = replicas
        .filter((replica) => replica && replica.node_id)
        .map((replica) => replica.node_id);
      if (nodeIds.length === NUM.ZERO) {
        return false;
      }
      return new Set(nodeIds).size < nodeIds.length;
    }

    /**
     * Get nodes that do not have a local replica.
     * @param {Array<Object>} replicas
     * @return {Array<string>}
     */
    getNodesWithoutLocalReplica(replicas) {
      const allNodes = this.moveStateProvider.getAvailableNodes();
      let localAccessReplicas = replicas;
      const cache = this.moveStateProvider.systemTableCache;
      if (
        this.entityType === EntityType.MESSAGE_GROUP &&
        cache &&
        typeof cache.filter === MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        localAccessReplicas = cache.filter(SYSTEM_TABLE_NAME.SERVICES, (service) =>
          service?.service_type === EntityType.MESSAGE_GROUP &&
            service?.status === ReplicaStatus.ACTIVE &&
            typeof service?.node_id === MOVE_PLANNER_LITERAL.STRING &&
            service.node_id.length > NUM.ZERO,
        );
      }
      const nodesWithReplicas = new Set(
        localAccessReplicas
          .filter((replica) => replica && replica.node_id)
          .map((replica) => replica.node_id),
      );
      return allNodes
        .map((node) => node?.node_id || null)
        .filter((nodeId) => nodeId && !nodesWithReplicas.has(nodeId));
    }

    /**
     * Check whether this planner owns one of the startup-critical control-plane
     * partitions that must fan out promptly after bootstrap.
     * @return {boolean}
     */
    isControlPlanePriorityPartition() {
      if (this.entityType !== EntityType.PARTITION) {
        return false;
      }
      const systemTableCache = this.moveStateProvider?.systemTableCache || null;
      const partitionRow = getPartitionRowFromCache(systemTableCache, this.entityId);
      return isPriorityControlPlanePartition({
        partitionId: this.entityId,
        partitionRow,
      });
    }

    /**
     * Resolve this partition's recorded raft leader node id, used to bias
     * surplus-drain removal source selection away from the leader. Only
     * meaningful for partitions; returns null otherwise or when unknown.
     * @return {string|null}
     * @private
     */
    resolveRemovalSourcePartitionLeaderNodeId() {
      if (this.entityType !== EntityType.PARTITION) {
        return null;
      }
      const systemTableCache = this.moveStateProvider?.systemTableCache || null;
      const partitionRow = getPartitionRowFromCache(systemTableCache, this.entityId);
      const leaderNodeId =
        typeof partitionRow?.leader_node_id === 'string' ?
          partitionRow.leader_node_id.trim() :
          '';
      return leaderNodeId.length > NUM.ZERO ? leaderNodeId : null;
    }

    /**
     * Resolve whether this entity is one system-table partition.
     * @return {boolean}
     * @private
     */
    isSystemPartitionEntity() {
      if (this.entityType !== EntityType.PARTITION) {
        return false;
      }
      const systemTableCache = this.moveStateProvider?.systemTableCache || null;
      const partitionRow = getPartitionRowFromCache(systemTableCache, this.entityId);
      return isSystemTablePartition({
        partitionId: this.entityId,
        partitionRow,
      });
    }

    /**
     * Read topology-blocking in-flight operations for this entity.
     * @return {Array<Object>}
     * @private
     */
    getEntityTopologyBlockingInFlightOperations() {
      if (
        typeof this.moveStateProvider.getTopologyBlockingInFlightOperations ===
        MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        return this.moveStateProvider.getTopologyBlockingInFlightOperations();
      }
      if (
        typeof this.moveStateProvider.getInFlightOperations ===
        MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        return this.moveStateProvider.getInFlightOperations();
      }
      return [];
    }

    /**
     * Read global topology-blocking in-flight operations when the provider
     * exposes them; otherwise fall back to the entity-local owner view.
     * @return {Array<Object>}
     * @private
     */
    getGlobalTopologyBlockingInFlightOperations() {
      if (
        typeof this.moveStateProvider.getGlobalTopologyBlockingInFlightOperations ===
        MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        return this.moveStateProvider.getGlobalTopologyBlockingInFlightOperations();
      }
      return this.getEntityTopologyBlockingInFlightOperations();
    }

    /**
     * @param {Object} operation
     * @return {boolean}
     * @private
     */
    isAddTransitionalOperation(operation) {
      const workflowStep = operation?.workflow_step || null;
      const state = workflowStep ?
        String(workflowStep).toLowerCase() :
        operation?.status;
      return state === ReplicaStatus.PENDING ||
        state === ReplicaStatus.CREATING ||
        state === ReplicaStatus.SYNCING ||
        workflowStep === WORKFLOW_STEP.SENDING;
    }

    /**
     * Build one immutable snapshot of in-flight topology transitions for move
     * planning so add-target occupancy is adjudicated once.
     * @return {Object}
     * @private
     */
    buildTopologyTransitionSnapshot() {
      const entityInFlightOperations =
        this.getEntityTopologyBlockingInFlightOperations();
      const globalInFlightOperations =
        this.getGlobalTopologyBlockingInFlightOperations();
      const nodesWithEntityAddTransitional = new Set();
      const nodesWithGlobalSystemAddTransitional = new Set();
      const replicasInRemoving = new Set();

      for (const operation of entityInFlightOperations) {
        const isAddTransitional = this.isAddTransitionalOperation(operation);
        if (isAddTransitional) {
          nodesWithEntityAddTransitional.add(operation?.target_node_id || null);
        }
        const workflowStep = operation?.workflow_step || null;
        const state = workflowStep ?
          String(workflowStep).toLowerCase() :
          operation?.status;
        if (state === ReplicaStatus.REMOVING ||
            workflowStep === WORKFLOW_STEP.STOPPING) {
          replicasInRemoving.add(operation?.replica_id || null);
        }
      }

      if (this.isSystemPartitionEntity()) {
        for (const operation of globalInFlightOperations) {
          if (!this.isAddTransitionalOperation(operation)) {
            continue;
          }
          const partitionId = operation?.partition_id || null;
          if (!isSystemTablePartition({partitionId})) {
            continue;
          }
          nodesWithGlobalSystemAddTransitional.add(
            operation?.target_node_id || null,
          );
        }
      }

      return {
        pendingCount: entityInFlightOperations.length,
        nodesWithEntityAddTransitional,
        nodesWithGlobalSystemAddTransitional,
        replicasInRemoving,
        descriptorEpochDecision:
          this.resolvePartitionDescriptorEpochDecision(),
      };
    }

    /**
     * Resolve the descriptor-epoch decision exposed by the topology provider.
     * @return {Object|null}
     * @private
     */
    resolvePartitionDescriptorEpochDecision() {
      if (this.entityType !== EntityType.PARTITION) {
        return null;
      }
      const provider = this.moveStateProvider || {};
      if (
        typeof provider.getPartitionDescriptorEpochDecision ===
        MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        return provider.getPartitionDescriptorEpochDecision(this.entityId);
      }
      let evidence = null;
      if (
        typeof provider.getPartitionDescriptorEpochSnapshot ===
        MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        evidence = provider.getPartitionDescriptorEpochSnapshot(this.entityId);
      } else if (
        typeof provider.getPartitionDescriptorEpochEvidence ===
        MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        evidence = provider.getPartitionDescriptorEpochEvidence(this.entityId);
      }
      if (!evidence || typeof evidence !== MOVE_PLANNER_LITERAL.OBJECT) {
        return null;
      }
      if (evidence.decision) {
        return evidence;
      }
      return buildPartitionDescriptorEpochDecision({
        ...evidence,
        requirePartitionDescriptor:
          evidence.requirePartitionDescriptor !== false,
      });
    }

    /**
     * Resolve whether placement admission should run with critical-system
     * semantics for this entity.
     *
     * Critical-system classification is provider-owned. MovePlanner should not
     * keep a second local detector alive for the same semantic question.
     *
     * @return {boolean}
     * @private
     */
    isCriticalAdmissionEntity() {
      if (
        this.moveStateProvider &&
        typeof this.moveStateProvider.isCriticalSystemPartition ===
          MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        return this.moveStateProvider.isCriticalSystemPartition() === true;
      }
      return false;
    }

    /**
     * Check whether healthy replicas are concentrated on too few nodes even
     * though ready nodes exist to spread them.
     * @param {Array<Object>} replicas
     * @param {Object} policy
     * @param {Array<Object>|null} [availableNodes]
     * @return {boolean}
     */
    hasSpreadableReplicaConcentration(replicas, policy, availableNodes = null) {
      const prioritySpread = this.analyzePrioritySpread(
        replicas,
        policy,
        availableNodes,
      );
      if (prioritySpread.requiresSpread !== true) {
        return false;
      }
      return prioritySpread.satisfied !== true &&
        prioritySpread.hasUnusedReadyNodes === true;
    }

    /**
     * Analyze the priority control-plane spread invariant for this entity.
     * @param {Array<Object>} replicas
     * @param {Object} policy
     * @param {Array<Object>|null} [availableNodes]
     * @return {Object}
     */
    analyzePrioritySpread(replicas, policy, availableNodes = null) {
      const readyNodes = Array.isArray(availableNodes) ?
        availableNodes :
        this.moveStateProvider.getAvailableNodes();
      const healthyReplicas = this.getHealthyReplicas(replicas);
      const distinctNodeIds = new Set(
        healthyReplicas
          .filter((replica) => replica && replica.node_id)
          .map((replica) => replica.node_id),
      );
      const requiresSpread =
        this.isControlPlanePriorityPartition() &&
        policy?.placementConstraints?.spreadAcrossNodes === true;
      const requiredDistinctNodeCount = requiresSpread ?
        Math.min(NUM.THREE, readyNodes.length) :
        NUM.ZERO;
      const hasUnusedReadyNodes = readyNodes.some(
        (node) => node && node.node_id && !distinctNodeIds.has(node.node_id),
      );
      return {
        isPriorityPartition: this.isControlPlanePriorityPartition(),
        requiresSpread,
        requiredDistinctNodeCount,
        actualDistinctNodeCount: distinctNodeIds.size,
        hasUnusedReadyNodes,
        satisfied:
          requiresSpread !== true ||
          requiredDistinctNodeCount <= NUM.ONE ||
          distinctNodeIds.size >= requiredDistinctNodeCount,
      };
    }

    /**
     * Check if current state is critical.
     * @param {Array<Object>} replicas
     * @param {Object} policy
     * @param {Array<Object>|null} [availableNodes]
     * @return {boolean}
     */
    isCriticalState(replicas, policy, availableNodes = null) {
      const healthyReplicas = this.getHealthyReplicas(replicas);
      const readyNodes = Array.isArray(availableNodes) ?
        availableNodes :
        this.moveStateProvider.getAvailableNodes();
      const minReplicas = policy.minReplicaCount || NUM.THREE;
      if (
        healthyReplicas.length < minReplicas &&
        readyNodes.length >= minReplicas
      ) {
        return true;
      }
      if (
        this.entityType === EntityType.MESSAGE_GROUP &&
        policy.ensureLocalAccess
      ) {
        return this.getNodesWithoutLocalReplica(replicas).length > NUM.ZERO;
      }
      if (this.hasSpreadableReplicaConcentration(replicas, policy, readyNodes)) {
        return true;
      }
      return false;
    }

    /**
     * Get the reason for critical state.
     * @param {Array<Object>} replicas
     * @param {Object} policy
     * @param {Array<Object>|null} [availableNodes]
     * @return {string}
     */
    getCriticalReason(replicas, policy, availableNodes = null) {
      const healthyReplicas = this.getHealthyReplicas(replicas);
      const readyNodes = Array.isArray(availableNodes) ?
        availableNodes :
        this.moveStateProvider.getAvailableNodes();
      const minReplicas = policy.minReplicaCount || NUM.THREE;
      if (
        healthyReplicas.length < minReplicas &&
        readyNodes.length >= minReplicas
      ) {
        return `replica_count_below_minimum: ${healthyReplicas.length} < ${minReplicas}`;
      }
      if (
        this.entityType === EntityType.MESSAGE_GROUP &&
        policy.ensureLocalAccess
      ) {
        const nodesWithoutLocalReplica = this.getNodesWithoutLocalReplica(replicas);
        if (nodesWithoutLocalReplica.length > NUM.ZERO) {
          return MOVE_PLANNER_LITERAL.NODES_WITHOUT_LOCAL_REPLICA +
            nodesWithoutLocalReplica.join(MOVE_PLANNER_LITERAL.EMPTY);
        }
      }
      if (this.hasSpreadableReplicaConcentration(replicas, policy, readyNodes)) {
        const distinctNodeCount = new Set(
          healthyReplicas
            .filter((replica) => replica && replica.node_id)
            .map((replica) => replica.node_id),
        ).size;
        return MOVE_PLANNER_LITERAL.CONTROL_PLANE_REPLICAS_NOT_SPREAD +
          `${distinctNodeCount}/${readyNodes.length}`;
      }
      return MOVE_PLANNER_LITERAL.UNKNOWN;
    }

    /**
     * Check if current state is suboptimal.
     * @param {Array<Object>} replicas
     * @param {Object} policy
     * @param {Array<Object>|null} [availableNodes]
     * @return {boolean}
     */
    isSuboptimalState(replicas, policy, availableNodes = null) {
      const targetCount = this.getPolicyTargetReplicaCount(policy);
      const healthyReplicas = this.getHealthyReplicas(replicas);
      const readyNodes = Array.isArray(availableNodes) ?
        availableNodes :
        this.moveStateProvider.getAvailableNodes();
      const actionableTarget = this.getActionableTargetReplicaCount(
        policy,
        readyNodes,
      );
      if (
        healthyReplicas.length < actionableTarget ||
        healthyReplicas.length > targetCount
      ) {
        return true;
      }
      if (
        policy.placementConstraints?.spreadAcrossNodes &&
        this.hasMultipleReplicasOnSameNode(healthyReplicas)
      ) {
        const usedNodeIds = new Set(
          healthyReplicas
            .filter((replica) => replica && replica.node_id)
            .map((replica) => replica.node_id),
        );
        const unusedNodes = readyNodes.filter(
          (node) => node && node.node_id && !usedNodeIds.has(node.node_id),
        );
        if (unusedNodes.length > NUM.ZERO) {
          return true;
        }
      }
      return false;
    }

    /**
     * Apply policy to determine if rebalancing is needed.
     * @param {Object} policy
     * @return {Object}
     */
    applyPolicy(policy) {
      const currentReplicas = this.getCurrentReplicas();
      const healthyReplicas = this.getHealthyReplicas(currentReplicas);
      const availableNodes = this.moveStateProvider.getAvailableNodes();
      const actionableTarget = this.getActionableTargetReplicaCount(
        policy,
        availableNodes,
      );
      const targetCount = this.calculateTargetReplicaCount(
        currentReplicas,
        policy,
      );
      const replicaCountDecision = buildReplicaCountPolicyDecision({
        healthyReplicaCount: healthyReplicas.length,
        actionableTarget,
        targetCount,
      });
      let decision = {
        ...replicaCountDecision,
        currentCount: healthyReplicas.length,
        targetCount,
        policy,
      };
      const usedNodeIds = new Set(
        healthyReplicas
          .filter((replica) => replica && replica.node_id)
          .map((replica) => replica.node_id),
      );
      const spreadAcrossNodesBlocked =
        policy.placementConstraints?.spreadAcrossNodes &&
        this.hasMultipleReplicasOnSameNode(healthyReplicas);
      const unusedNodes = spreadAcrossNodesBlocked ?
        availableNodes.filter(
          (node) => node && node.node_id && !usedNodeIds.has(node.node_id),
        ) :
        [];
      const enforceLocalAccess =
        this.entityType === EntityType.MESSAGE_GROUP && policy.ensureLocalAccess;
      const nodesWithoutReplica = enforceLocalAccess ?
        this.getNodesWithoutLocalReplica(currentReplicas) :
        [];
      decision = applyAdditionalRebalancingReason(
        decision,
        unusedNodes.length > NUM.ZERO,
        MOVE_PLANNER_REBALANCE_REASON.REPLICAS_NOT_SPREAD,
      );
      decision = applyAdditionalRebalancingReason(
        decision,
        nodesWithoutReplica.length > NUM.ZERO,
        MOVE_PLANNER_REBALANCE_REASON.NODES_WITHOUT_LOCAL_REPLICA,
      );
      return decision;
    }

    /**
     * Assess the current state for logging and scheduling.
     * @param {Array<Object>} currentReplicas
     * @param {Object} policy
     * @param {Array<Object>|null} [availableNodes]
     * @return {Object}
     */
    assessState(currentReplicas, policy, availableNodes = null) {
      const readyNodes = Array.isArray(availableNodes) ?
        availableNodes :
        this.moveStateProvider.getAvailableNodes();
      const healthyReplicas = this.getHealthyReplicas(currentReplicas);
      const desiredTarget = this.getPolicyTargetReplicaCount(policy);
      const actionableTarget = this.getActionableTargetReplicaCount(
        policy,
        readyNodes,
      );
      const critical = this.isCriticalState(currentReplicas, policy, readyNodes);
      return {
        healthyReplicas,
        desiredTarget,
        actionableTarget,
        critical,
        criticalReason: critical ?
          this.getCriticalReason(currentReplicas, policy, readyNodes) :
          null,
        suboptimal:
          !critical && this.isSuboptimalState(currentReplicas, policy, readyNodes),
      };
    }

    /**
     * Read current replicas from the owner provider.
     * @return {Array<Object>}
     * @private
     */
    getCurrentReplicas() {
      if (
        typeof this.moveStateProvider.getCurrentReplicas !==
        MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        return [];
      }
      return this.moveStateProvider.getCurrentReplicas();
    }

    /**
     * Read healthy replicas through the owner provider.
     * @param {Array<Object>} replicas
     * @return {Array<Object>}
     * @private
     */
    getHealthyReplicas(replicas) {
      if (
        typeof this.moveStateProvider.getHealthyReplicas !==
        MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        return Array.isArray(replicas) ? replicas : [];
      }
      return this.moveStateProvider.getHealthyReplicas(replicas);
    }
  }

  return Object.getOwnPropertyNames(MovePlannerStateMethods.prototype)
    .filter((name) => name !== LOCAL_STR_CONSTRUCTOR)
    .reduce((accumulator, name) => {
      accumulator[name] = MovePlannerStateMethods.prototype[name];
      return accumulator;
    }, {});
}

export {createMovePlannerStateMethods};
