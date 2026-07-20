const LOCAL_STR_CONSTRUCTOR = 'constructor';
const EMPTY_REPLICA_LIST = Object.freeze([]);
const PLANNER_INVENTORY_OBSERVATION_STATE = Object.freeze({
  PRESENT: 'present',
  EMPTY: 'empty',
  UNAVAILABLE: 'unavailable',
});

function resolvePlannerInventoryObservationState(values, available = true) {
  if (!available || !Array.isArray(values)) {
    return PLANNER_INVENTORY_OBSERVATION_STATE.UNAVAILABLE;
  }
  return values.length > 0 ?
    PLANNER_INVENTORY_OBSERVATION_STATE.PRESENT :
    PLANNER_INVENTORY_OBSERVATION_STATE.EMPTY;
}

function buildPlannerReplicaInventory(options) {
  const {
    builder,
    entityType,
    entityId,
    currentReplicas,
    operations,
    operationObservationAvailable,
    captureBefore,
    captureAfter,
  } = options;
  return builder({
    entityType,
    entityId,
    capturedAtMs: captureAfter.capturedAtMs,
    committedRowsObservation: {
      state: resolvePlannerInventoryObservationState(currentReplicas),
      rows: currentReplicas,
      revisionBefore: captureBefore.committedRows.revision,
      revisionAfter: captureAfter.committedRows.revision,
      revision: captureAfter.committedRows.revision,
      watermarkBefore: captureBefore.committedRows.lastAppliedAtMs,
      watermarkAfter: captureAfter.committedRows.lastAppliedAtMs,
      causeId: captureAfter.committedRows.causeId,
      observedAtMs: captureBefore.capturedAtMs,
    },
    inFlightOperationObservation: {
      state: resolvePlannerInventoryObservationState(
        operations,
        operationObservationAvailable,
      ),
      operations,
      revisionBefore: captureBefore.inFlightOperations.revision,
      revisionAfter: captureAfter.inFlightOperations.revision,
      revision: captureAfter.inFlightOperations.revision,
      watermarkBefore: captureBefore.inFlightOperations.lastAppliedAtMs,
      watermarkAfter: captureAfter.inFlightOperations.lastAppliedAtMs,
      causeId: captureAfter.inFlightOperations.causeId,
      observedAtMs: captureAfter.capturedAtMs,
    },
  });
}

function buildEntityTransitionSets(inventory, ReplicaStatus, WORKFLOW_STEP) {
  const nodesWithEntityAddTransitional = new Set();
  const replicasInRemoving = new Set();
  for (const operation of inventory.operations) {
    if (operation.addTransitional) {
      nodesWithEntityAddTransitional.add(operation.targetNodeId || null);
    }
    const workflowStep = operation.workflowStep || null;
    const state = workflowStep ?
      String(workflowStep).toLowerCase() :
      operation.status;
    if (state === ReplicaStatus.REMOVING ||
        workflowStep === WORKFLOW_STEP.STOPPING) {
      replicasInRemoving.add(
        operation.sourceReplicaId || operation.targetReplicaId || null,
      );
    }
  }
  return {nodesWithEntityAddTransitional, replicasInRemoving};
}

function buildGlobalSystemTransitionNodeSet(options) {
  const targetNodeIds = new Set();
  if (!options.systemPartition) {
    return targetNodeIds;
  }
  for (const operation of options.operations) {
    if (!options.isAddTransitional(operation)) {
      continue;
    }
    const partitionId = operation?.partition_id || null;
    if (!options.isSystemPartition({partitionId})) {
      continue;
    }
    targetNodeIds.add(operation?.target_node_id || null);
  }
  return targetNodeIds;
}

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
    classifySystemPartition,
    getNextOddCount,
    getPartitionRowFromCache,
    getPreviousOddCount,
    isDataAffinityPlacementSuboptimal,
    isOddReplicaCount,
    isReplicaInventoryAddTransitionalOperation,
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
        this.entityType === EntityType.RUNTIME_SERVICE ? 1 : NUM.THREE;
      const defaultMax = this.entityType === EntityType.RUNTIME_SERVICE ?
        Math.max(defaultMin, count || defaultMin) :
        NUM.SEVEN;
      // Ship-not-started contract: a runtime service with an explicit
      // target of 0 places NO replicas (getRuntimeServicePolicy's
      // documented semantics). The min clamp must not resurrect it.
      if (this.entityType === EntityType.RUNTIME_SERVICE && count === 0) {
        return 0;
      }
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
        this.entityType === EntityType.RUNTIME_SERVICE ? 1 : NUM.THREE;
      // `||` would coerce an EXPLICIT 0 (ship-not-started) to the
      // default — resolve explicit finite values first.
      const explicitTarget = [
        policy.targetReplicaCount,
        policy.replicaCount,
      ].find((value) => Number.isFinite(value) && value >= 0);
      return explicitTarget !== undefined ? explicitTarget : defaultTarget;
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
        0;
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
      if (nodeIds.length === 0) {
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
            service.node_id.length > 0,
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
      return classifySystemPartition({
        partitionId: this.entityId,
        partitionRow,
      }).priorityControlPlane;
    }

    /**
     * Check whether this is the exact non-priority partition whose durable
     * liveness rows depend on formation-time spread.
     * @return {boolean}
     */
    isFormationLivenessDependencyPartition() {
      if (this.entityType !== EntityType.PARTITION) {
        return false;
      }
      const systemTableCache = this.moveStateProvider?.systemTableCache || null;
      const partitionRow = getPartitionRowFromCache(systemTableCache, this.entityId);
      return classifySystemPartition({
        partitionId: this.entityId,
        partitionRow,
      }).formationLivenessDependency;
    }

    /**
     * Select the one immutable serial planning owner without granting the
     * formation dependency the broader priority-control-plane identity.
     * @return {boolean}
     */
    usesSerialGoalStatePlanner() {
      return this.isControlPlanePriorityPartition() ||
        this.isFormationLivenessDependencyPartition();
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
      return classifySystemPartition({
        partitionId: this.entityId,
        partitionRow,
      }).systemTable;
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
     * Read ALL non-terminal in-flight operations for this entity, INCLUDING
     * REPLACEs in their remove-dispatch drain phase. Unlike
     * getEntityTopologyBlockingInFlightOperations (which excludes drain-phase
     * REPLACEs via isTopologyBlockingInFlightOperation), this is the set that
     * holds the per-partition reconfiguration serialization lock for its whole
     * lifetime — what a REPLACE-serialization cap must count, since the standoff
     * is built by drain-phase REPLACEs the topology-blocking view cannot see.
     * @return {Array<Object>}
     * @private
     */
    getEntityInFlightOperations() {
      if (
        typeof this.moveStateProvider.getInFlightOperations ===
        MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        return this.moveStateProvider.getInFlightOperations();
      }
      return this.getEntityTopologyBlockingInFlightOperations();
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
     * Capture real cache generation and observation watermarks at one edge of
     * an inventory read. Callers bracket row/operation capture with two of
     * these snapshots; the inventory owner compares like-domain revisions.
     * @return {Object}
     */
    captureReplicaInventorySourceState() {
      const cache = this.moveStateProvider?.systemTableCache || null;
      const canReadRevision =
        typeof cache?.getAppliedSchemaVersion === MOVE_PLANNER_LITERAL.FUNCTION;
      const canReadAppliedAt =
        typeof cache?.getLastAppliedAtMs === MOVE_PLANNER_LITERAL.FUNCTION;
      const canReadCause =
        typeof cache?.getLastAppliedCauseId === MOVE_PLANNER_LITERAL.FUNCTION;
      const captureTable = (tableName) => ({
        revision: canReadRevision ? cache.getAppliedSchemaVersion(tableName) : null,
        lastAppliedAtMs: canReadAppliedAt ? cache.getLastAppliedAtMs(tableName) : null,
        causeId: canReadCause ? cache.getLastAppliedCauseId(tableName) : null,
      });
      return {
        capturedAtMs: Date.now(),
        committedRows: captureTable(SYSTEM_TABLE_NAME.SERVICES),
        inFlightOperations: captureTable(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS),
      };
    }

    /**
     * Build one immutable snapshot of in-flight topology transitions for move
     * planning so add-target occupancy is adjudicated once.
     * @param {Array<Object>} currentReplicas
     * @return {Object}
     * @private
     */
    buildTopologyTransitionSnapshot(
      currentReplicas = [],
      sourceStateBefore = null,
    ) {
      const captureBefore =
        sourceStateBefore || this.captureReplicaInventorySourceState();
      const entityInFlightOperations =
        this.getEntityTopologyBlockingInFlightOperations();
      const globalInFlightOperations =
        this.getGlobalTopologyBlockingInFlightOperations();
      const captureAfter = this.captureReplicaInventorySourceState();
      const operationObservationAvailable =
        typeof this.moveStateProvider.getTopologyBlockingInFlightOperations ===
          MOVE_PLANNER_LITERAL.FUNCTION ||
        typeof this.moveStateProvider.getInFlightOperations ===
          MOVE_PLANNER_LITERAL.FUNCTION;
      const inventory = buildPlannerReplicaInventory({
        builder: this.replicaInventoryBuilder,
        entityType: this.entityType,
        entityId: this.entityId,
        currentReplicas,
        operations: entityInFlightOperations,
        operationObservationAvailable,
        captureBefore,
        captureAfter,
      });
      const {
        nodesWithEntityAddTransitional,
        replicasInRemoving,
      } = buildEntityTransitionSets(inventory, ReplicaStatus, WORKFLOW_STEP);
      const nodesWithGlobalSystemAddTransitional =
        buildGlobalSystemTransitionNodeSet({
          systemPartition: this.isSystemPartitionEntity(),
          operations: globalInFlightOperations,
          isAddTransitional: isReplicaInventoryAddTransitionalOperation,
          isSystemPartition: (options) =>
            classifySystemPartition(options).systemTable,
        });

      return {
        pendingCount: entityInFlightOperations.length,
        nodesWithEntityAddTransitional,
        nodesWithGlobalSystemAddTransitional,
        replicasInRemoving,
        inventory,
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
        typeof this.moveStateProvider.isSystemPartitionEntity ===
          MOVE_PLANNER_LITERAL.FUNCTION
      ) {
        return this.moveStateProvider.isSystemPartitionEntity() === true;
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
        0;
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
          requiredDistinctNodeCount <= 1 ||
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
      // The critical minimum never exceeds the desired target: a
      // ship-not-started service (explicit target 0) is NOT critical
      // at zero replicas — the min floor forcing adds here was the
      // third clamp defeating the documented target-0 semantics.
      const minReplicas = Math.min(
        policy.minReplicaCount || NUM.THREE,
        this.getPolicyTargetReplicaCount(policy),
      );
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
        return this.getNodesWithoutLocalReplica(replicas).length > 0;
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
      const minReplicas = Math.min(
        policy.minReplicaCount || NUM.THREE,
        this.getPolicyTargetReplicaCount(policy),
      );
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
        if (nodesWithoutLocalReplica.length > 0) {
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
        if (unusedNodes.length > 0) {
          return true;
        }
      }
      // Data-affinity observer (placement-owner-decision owns the scoring):
      // count and spread being satisfied must not blind the gate to a
      // placement sitting off its data.
      if (
        typeof isDataAffinityPlacementSuboptimal === 'function' &&
        isDataAffinityPlacementSuboptimal(policy, healthyReplicas, readyNodes)
      ) {
        return true;
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
        unusedNodes.length > 0,
        MOVE_PLANNER_REBALANCE_REASON.REPLICAS_NOT_SPREAD,
      );
      decision = applyAdditionalRebalancingReason(
        decision,
        nodesWithoutReplica.length > 0,
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
        return EMPTY_REPLICA_LIST;
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
        return Array.isArray(replicas) ? replicas : EMPTY_REPLICA_LIST;
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
