/**
 * Move Planner - Calculates replica placement and moves for rebalancing.
 *
 * This module provides move planning logic extracted from UnifiedRebalancer.
 * It calculates target replica state and the moves needed to reach that state.
 *
 * Requirements: 1.3, 1.8, 5.1, 5.2, 5.3, 5.4, 5.5, 11.3
 *
 * @module rebalancer/move-planner
 */

import {LoggingService} from '../logging/logging-service.js';
import {NUM} from '../constants/index.js';
import {ReplicaStatus} from './replica-status.js';
import {
  PLACEMENT_DEGRADED_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
  REBALANCER_SUBSYSTEM,
} from './rebalancer-constants.js';
import {
  ADMISSION_DECISION,
  MOVE_CRITICALITY,
  PRESSURE_BEHAVIOR_DECISION,
  STORAGE_CAPACITY_LOG_MSG,
} from './storage-capacity-constants.js';

const EntityType = REBALANCER_ENTITY_TYPE;
const MoveType = REBALANCER_MOVE_TYPE;
const DegradedReason = PLACEMENT_DEGRADED_REASON;
const MOVE_PLANNER_TOPOLOGY_SCORE = Object.freeze({
  SAME_GROUP_BONUS: 5,
  SAME_GROUP_PENALTY: 2,
  DIVERSITY_NEW_GROUP_BONUS: 4,
  DIVERSITY_EXISTING_GROUP_PENALTY: 4,
});

/**
 * MovePlanner calculates replica placement and moves for partitions
 * and message groups.
 *
 * This class is responsible for:
 * - Calculating target replica state based on policy
 * - Filtering infeasible nodes by storage capacity before scoring
 * - Determining optimal node placement for replicas
 * - Calculating the moves needed to reach target state
 * - Sorting nodes by load and suitability
 *
 * Requirements: 1.3, 1.8, 5.1, 5.2, 5.3, 5.4, 5.5, 11.3
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {string} options.entityId - Partition ID or message group ID
 * @param {string} options.entityType - 'partition' or 'message_group'
 * @param {Object} options.moveStateProvider - Provider for state access
 * @param {Object} [options.storageAdmissionService] - Admission gate
 * @param {Object} [options.accountingService] - Capacity accounting
 * @param {Object} [options.storagePressureBehavior] - Pressure behavior
 */
class MovePlanner {
  /**
   * Create a new MovePlanner instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.entityId - Partition ID or message group ID.
   * @param {string} options.entityType - 'partition' or 'message_group'.
   * @param {Object} options.moveStateProvider - Provider for state access.
   * @param {Object} [options.storageAdmissionService] - Admission gate.
   * @param {Object} [options.accountingService] - Capacity accounting.
   * @param {Object} [options.storagePressureBehavior] - Pressure behavior.
   */
  constructor(options = {}) {
    if (!options.entityId) {
      throw new Error('MovePlanner requires entityId');
    }
    if (!options.entityType) {
      throw new Error('MovePlanner requires entityType');
    }
    if (!options.moveStateProvider) {
      throw new Error('MovePlanner requires moveStateProvider');
    }

    this.entityId = options.entityId;
    this.entityType = options.entityType;
    this.moveStateProvider = options.moveStateProvider;
    this.storageAdmissionService = options.storageAdmissionService || null;
    this.accountingService = options.accountingService || null;
    this.storagePressureBehavior =
      options.storagePressureBehavior || null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED) : console;
  }

  /**
   * Calculate target state based on policy.
   * Applies capacity feasibility filter before scoring when admission
   * service is available.
   *
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @return {Promise<Object>} Target state with replica count and
   *   placement.
   */
  async calculateTargetState(currentReplicas, policy) {
    const nodes = this.moveStateProvider.getAvailableNodes();
    const targetReplicaCount =
      policy.targetReplicaCount || policy.replicaCount || NUM.THREE;

    const estimatedBytes = this.getEstimatedBytesForEntity();
    const {feasibleNodes, diagnostics} =
      await this.filterNodesByCapacity(nodes, estimatedBytes);

    // For message groups: ensure every node has local access
    if (this.entityType === EntityType.MESSAGE_GROUP &&
        policy.ensureLocalAccess) {
      return this.calculateMessageGroupPlacement(
        feasibleNodes, targetReplicaCount, policy, diagnostics,
      );
    }

    // For partitions: spread across nodes by policy
    return this.calculatePartitionPlacement(
      feasibleNodes, targetReplicaCount, policy, diagnostics,
    );
  }

  /**
   * Estimate bytes needed for a replica of this entity type.
   * Delegates to accountingService when available.
   * @return {number} estimated bytes or 0 when unavailable
   * @private
   */
  getEstimatedBytesForEntity() {
    if (!this.accountingService ||
        typeof this.accountingService.estimateReplicaBytes !==
          'function') {
      return NUM.ZERO;
    }
    return this.accountingService.estimateReplicaBytes({
      entityType: this.entityType,
      sizeBytes: NUM.ZERO,
    });
  }

  /**
   * Filter nodes by storage capacity feasibility.
   *
   * When storageAdmissionService is available, each candidate node is
   * checked via checkAdd. Nodes that fail admission are excluded from
   * placement. When the service is unavailable, all nodes pass through
   * unchanged (graceful degradation).
   *
   * Requirements: 5.1, 5.4, 11.3
   *
   * @param {Array<Object>} nodes - Candidate nodes.
   * @param {number} estimatedBytes - Estimated bytes for the replica.
   * @return {Promise<Object>} { feasibleNodes, diagnostics }
   * @private
   */
  async filterNodesByCapacity(nodes, estimatedBytes) {
    const diagnostics = {
      totalCandidates: nodes.length,
      feasibleCount: nodes.length,
      rejectedCount: NUM.ZERO,
      rejectionsByReason: {},
      capacityFilterApplied: false,
    };

    if (!this.storageAdmissionService || estimatedBytes <= NUM.ZERO) {
      diagnostics.feasibleCount = nodes.length;
      return {feasibleNodes: nodes, diagnostics};
    }

    diagnostics.capacityFilterApplied = true;
    const feasibleNodes = [];

    for (const node of nodes) {
      const nodeId = node.node_id;
      try {
        const result = await this.storageAdmissionService.checkAdd({
          targetNodeId: nodeId,
          estimatedBytes,
        });

        if (result.decision === ADMISSION_DECISION.ALLOW) {
          feasibleNodes.push(node);
        } else {
          const reason = result.reason;
          diagnostics.rejectionsByReason[reason] =
            (diagnostics.rejectionsByReason[reason] || NUM.ZERO) +
            NUM.ONE;
          this.logger.debug(
            STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, {
              entityId: this.entityId,
              nodeId,
              reason,
              projectedUtilization: result.projectedUtilization,
            });
        }
      } catch (_err) {
        // On error, include the node to preserve availability
        feasibleNodes.push(node);
      }
    }

    diagnostics.feasibleCount = feasibleNodes.length;
    diagnostics.rejectedCount = nodes.length - feasibleNodes.length;

    if (diagnostics.rejectedCount > NUM.ZERO) {
      this.logger.info(
        STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_APPLIED, {
          entityId: this.entityId,
          entityType: this.entityType,
          totalCandidates: diagnostics.totalCandidates,
          feasibleCount: diagnostics.feasibleCount,
          rejectedCount: diagnostics.rejectedCount,
          rejectionsByReason: diagnostics.rejectionsByReason,
        });
    }

    return {feasibleNodes, diagnostics};
  }

  /**
   * Determine the degraded reason based on node counts and capacity
   * filter results.
   *
   * Requirements: 5.3
   *
   * @param {number} totalReadyNodes - Nodes before capacity filter.
   * @param {number} feasibleCount - Nodes after capacity filter.
   * @param {number} effectiveCount - Nodes actually placed.
   * @param {number} targetCount - Desired replica count.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {string|null} Degraded reason or null.
   * @private
   */
  getDegradedReason(
    totalReadyNodes, feasibleCount, effectiveCount,
    targetCount, diagnostics,
  ) {
    if (effectiveCount >= targetCount) {
      return null;
    }
    // Capacity filtering removed nodes — capacity is the bottleneck
    // when the filter reduced the candidate set below target.
    if (diagnostics.rejectedCount > NUM.ZERO &&
        feasibleCount < targetCount) {
      return DegradedReason.INSUFFICIENT_CAPACITY;
    }
    // Not enough ready nodes regardless of capacity
    return DegradedReason.INSUFFICIENT_NODES;
  }

  /**
   * Calculate optimal placement for message groups.
   * Ensures every node has at least one local replica.
   * @param {Array<Object>} nodes - Feasible nodes after capacity filter.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Message group policy.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {Object} Target placement state.
   */
  calculateMessageGroupPlacement(
    nodes, targetCount, policy, diagnostics,
  ) {
    const targetNodes = [];
    const diag = diagnostics || {
      totalCandidates: nodes ? nodes.length : NUM.ZERO,
      feasibleCount: nodes ? nodes.length : NUM.ZERO,
      rejectedCount: NUM.ZERO,
      rejectionsByReason: {},
      capacityFilterApplied: false,
    };
    const totalReadyNodes = diag.totalCandidates;

    // No feasible nodes: we cannot place any replicas.
    if (!nodes || nodes.length === 0) {
      const degradedReason = this.getDegradedReason(
        totalReadyNodes, NUM.ZERO, NUM.ZERO,
        targetCount, diag,
      );
      return {
        targetReplicaCount: targetCount,
        targetNodes: [],
        maxReplicaCount: policy.maxReplicaCount || NUM.FIVE,
        degraded: true,
        degradedReason,
        availableNodeCount: NUM.ZERO,
        capacityDiagnostics: diag,
      };
    }

    // First, ensure we have replicas spread across nodes
    if (policy.placementConstraints?.spreadAcrossNodes) {
      // Sort nodes by current replica load (prefer less loaded nodes)
      const sortedNodes = this.sortNodesByLoad(nodes);

      if (sortedNodes.length === 0) {
        const degradedReason = this.getDegradedReason(
          totalReadyNodes, NUM.ZERO, NUM.ZERO,
          targetCount, diag,
        );
        return {
          targetReplicaCount: targetCount,
          targetNodes: [],
          maxReplicaCount: policy.maxReplicaCount || NUM.FIVE,
          degraded: true,
          degradedReason,
          availableNodeCount: NUM.ZERO,
          capacityDiagnostics: diag,
        };
      }

      const effectiveCount = Math.min(targetCount, sortedNodes.length);

      // Select target nodes — one replica per node, no wrapping
      for (let i = 0; i < effectiveCount; i++) {
        targetNodes.push(sortedNodes[i].node_id);
      }

      const degradedReason = this.getDegradedReason(
        totalReadyNodes, sortedNodes.length, effectiveCount,
        targetCount, diag,
      );

      return {
        targetReplicaCount: targetCount,
        targetNodes,
        maxReplicaCount: policy.maxReplicaCount || NUM.FIVE,
        degraded: effectiveCount < targetCount,
        degradedReason,
        availableNodeCount: sortedNodes.length,
        capacityDiagnostics: diag,
      };
    }

    const degradedReason = this.getDegradedReason(
      totalReadyNodes, nodes.length, targetNodes.length,
      targetCount, diag,
    );

    return {
      targetReplicaCount: targetCount,
      targetNodes,
      maxReplicaCount: policy.maxReplicaCount || NUM.FIVE,
      degraded: targetNodes.length < targetCount,
      degradedReason,
      availableNodeCount: nodes.length,
      capacityDiagnostics: diag,
    };
  }

  /**
   * Calculate optimal placement for partitions.
   * @param {Array<Object>} nodes - Feasible nodes after capacity filter.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Table policy.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {Object} Target placement state.
   */
  calculatePartitionPlacement(nodes, targetCount, policy, diagnostics) {
    const targetNodes = [];
    const diag = diagnostics || {
      totalCandidates: nodes ? nodes.length : NUM.ZERO,
      feasibleCount: nodes ? nodes.length : NUM.ZERO,
      rejectedCount: NUM.ZERO,
      rejectionsByReason: {},
      capacityFilterApplied: false,
    };
    const totalReadyNodes = diag.totalCandidates;

    // Sort nodes by suitability based on policy constraints
    const sortedNodes = this.sortNodesBySuitability(nodes, policy);

    // No feasible nodes: we cannot place any replicas.
    if (sortedNodes.length === 0) {
      const degradedReason = this.getDegradedReason(
        totalReadyNodes, NUM.ZERO, NUM.ZERO,
        targetCount, diag,
      );
      return {
        targetReplicaCount: targetCount,
        targetNodes: [],
        minReplicaCount: policy.minReplicaCount || NUM.THREE,
        maxReplicaCount: policy.maxReplicaCount || NUM.SEVEN,
        degraded: true,
        degradedReason,
        availableNodeCount: NUM.ZERO,
        capacityDiagnostics: diag,
      };
    }

    // Keep desired replica target independent of current node count.
    // Placement assigns at most one replica per available node.
    const effectiveCount = Math.min(targetCount, sortedNodes.length);

    // Select target nodes — one replica per node, no wrapping
    for (let i = 0; i < effectiveCount; i++) {
      targetNodes.push(sortedNodes[i].node_id);
    }

    const degradedReason = this.getDegradedReason(
      totalReadyNodes, sortedNodes.length, effectiveCount,
      targetCount, diag,
    );

    return {
      targetReplicaCount: targetCount,
      targetNodes,
      minReplicaCount: policy.minReplicaCount || NUM.THREE,
      maxReplicaCount: policy.maxReplicaCount || NUM.SEVEN,
      degraded: effectiveCount < targetCount,
      degradedReason,
      availableNodeCount: sortedNodes.length,
      capacityDiagnostics: diag,
    };
  }

  /**
   * Sort nodes by current load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Available nodes.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesByLoad(nodes) {
    return [...nodes].sort((a, b) => {
      // Calculate load score (lower is better)
      const loadA = this.calculateNodeLoad(a);
      const loadB = this.calculateNodeLoad(b);
      return loadA - loadB;
    });
  }

  /**
   * Sort nodes by suitability based on policy constraints.
   * Includes storage-aware tie-breaking when capacity data is
   * available (Req 5.2).
   * @param {Array<Object>} nodes - Available nodes.
   * @param {Object} policy - Policy with placement constraints.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesBySuitability(nodes, policy) {
    const constraints = policy.placementConstraints || {};
    const topologyContext = this.buildTopologyPlacementContext(nodes);

    return [...nodes].sort((a, b) => {
      let scoreA = NUM.ZERO;
      let scoreB = NUM.ZERO;

      // Consider CPU load
      if (constraints.considerCpuLoad) {
        const cpuA = a.cpu_usage_percent || NUM.ZERO;
        const cpuB = b.cpu_usage_percent || NUM.ZERO;
        scoreA += cpuA;
        scoreB += cpuB;
      }

      // Consider memory load
      if (constraints.considerMemoryLoad) {
        const memA = a.memory_usage_percent || NUM.ZERO;
        const memB = b.memory_usage_percent || NUM.ZERO;
        scoreA += memA;
        scoreB += memB;
      }

      // Consider disk space
      if (constraints.considerDiskSpace) {
        const diskA = a.disk_usage_percent || NUM.ZERO;
        const diskB = b.disk_usage_percent || NUM.ZERO;
        scoreA += diskA;
        scoreB += diskB;
      }

      if (constraints.preferSameLatencyGroup) {
        scoreA += this.getSameLatencyGroupScoreAdjustment(a, topologyContext);
        scoreB += this.getSameLatencyGroupScoreAdjustment(b, topologyContext);
      }

      if (constraints.preferLatencyGroupDiversity) {
        scoreA += this.getLatencyGroupDiversityScoreAdjustment(
          a,
          topologyContext,
        );
        scoreB += this.getLatencyGroupDiversityScoreAdjustment(
          b,
          topologyContext,
        );
      }

      // Storage-aware tie-breaker: prefer nodes with more available
      // budget bytes (lower disk_usage_percent as proxy). This keeps
      // disk usage scoring as a secondary heuristic, not the hard
      // gate (Req 5.2).
      if (scoreA === scoreB) {
        const diskA = a.disk_usage_percent || NUM.ZERO;
        const diskB = b.disk_usage_percent || NUM.ZERO;
        return diskA - diskB;
      }

      return scoreA - scoreB;
    });
  }

  /**
   * Build topology scoring context from available nodes + current replicas.
   * @param {Array<Object>} nodes - Candidate nodes.
   * @return {Object}
   * @private
   */
  buildTopologyPlacementContext(nodes) {
    const nodeGroupById = new Map();
    for (const node of nodes) {
      const nodeId = node?.node_id;
      if (!nodeId) {
        continue;
      }
      nodeGroupById.set(nodeId, node?.latency_group_id || null);
    }

    const currentReplicas =
      typeof this.moveStateProvider.getCurrentReplicas === 'function' ?
        this.moveStateProvider.getCurrentReplicas() :
        [];
    const healthyReplicas =
      typeof this.moveStateProvider.getHealthyReplicas === 'function' ?
        this.moveStateProvider.getHealthyReplicas(currentReplicas) :
        currentReplicas;

    const existingGroupCounts = new Map();
    for (const replica of healthyReplicas) {
      const nodeId = replica?.node_id;
      const groupId = nodeGroupById.get(nodeId) || null;
      if (!groupId) {
        continue;
      }
      existingGroupCounts.set(
        groupId,
        (existingGroupCounts.get(groupId) || NUM.ZERO) + NUM.ONE,
      );
    }

    return {
      nodeGroupById,
      existingGroupCounts,
      dominantGroupId: this.selectDominantGroupId(existingGroupCounts),
    };
  }

  /**
   * Select dominant latency-group ID by current replica membership.
   * @param {Map<string, number>} existingGroupCounts
   * @return {string|null}
   * @private
   */
  selectDominantGroupId(existingGroupCounts) {
    let dominantGroupId = null;
    let dominantCount = NUM.ZERO;
    for (const [groupId, count] of existingGroupCounts.entries()) {
      if (count > dominantCount) {
        dominantGroupId = groupId;
        dominantCount = count;
        continue;
      }
      if (count === dominantCount &&
        dominantGroupId &&
        groupId < dominantGroupId) {
        dominantGroupId = groupId;
      }
    }
    return dominantGroupId;
  }

  /**
   * Score adjustment for same-group locality preference.
   * @param {Object} node
   * @param {Object} topologyContext
   * @return {number}
   * @private
   */
  getSameLatencyGroupScoreAdjustment(node, topologyContext) {
    const dominantGroupId = topologyContext.dominantGroupId;
    const nodeGroupId = topologyContext.nodeGroupById.get(node?.node_id) || null;
    if (!dominantGroupId || !nodeGroupId) {
      return NUM.ZERO;
    }
    if (nodeGroupId === dominantGroupId) {
      return -MOVE_PLANNER_TOPOLOGY_SCORE.SAME_GROUP_BONUS;
    }
    return MOVE_PLANNER_TOPOLOGY_SCORE.SAME_GROUP_PENALTY;
  }

  /**
   * Score adjustment for latency-group diversity preference.
   * @param {Object} node
   * @param {Object} topologyContext
   * @return {number}
   * @private
   */
  getLatencyGroupDiversityScoreAdjustment(node, topologyContext) {
    const nodeGroupId = topologyContext.nodeGroupById.get(node?.node_id) || null;
    if (!nodeGroupId) {
      return NUM.ZERO;
    }
    if (topologyContext.existingGroupCounts.has(nodeGroupId)) {
      return MOVE_PLANNER_TOPOLOGY_SCORE.DIVERSITY_EXISTING_GROUP_PENALTY;
    }
    return -MOVE_PLANNER_TOPOLOGY_SCORE.DIVERSITY_NEW_GROUP_BONUS;
  }

  /**
   * Calculate node load score.
   * @param {Object} node - Node object.
   * @return {number} Load score (0-300, lower is better).
   */
  calculateNodeLoad(node) {
    const cpuLoad = node.cpu_usage_percent || NUM.ZERO;
    const memoryLoad = node.memory_usage_percent || NUM.ZERO;
    const diskLoad = node.disk_usage_percent || NUM.ZERO;
    return cpuLoad + memoryLoad + diskLoad;
  }

  /**
   * Calculate moves needed to reach target state.
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} targetState - Target state.
   * @return {Array<Object>} Array of move operations.
   */
  calculateMoves(currentReplicas, targetState) {
    const moves = [];
    const healthyReplicas =
      this.moveStateProvider.getHealthyReplicas(currentReplicas);
    const targetNodeIds = targetState.targetNodes;
    const isDegradedPlacement = !!targetState?.degraded;

    const inFlightOperations =
      this.moveStateProvider.getInFlightOperations();
    const transitionalReplicas = [
      ...inFlightOperations.map((op) => ({
        replicaId: op.replica_id,
        partitionId: op.partition_id,
        nodeId: op.target_node_id,
        state: op.workflow_step ?
          op.workflow_step.toLowerCase() : op.status,
      })),
    ];

    // Build sets for quick lookup of transitional replicas
    const nodesWithAddTransitional = new Set();
    const replicasInRemoving = new Set();

    for (const replica of transitionalReplicas) {
      if (['pending', 'sending', 'creating', 'syncing']
        .includes(replica.state)) {
        if (replica.partitionId === this.entityId) {
          nodesWithAddTransitional.add(replica.nodeId);
        }
      }
      if (replica.state === 'removing' ||
          replica.state === 'stopping') {
        replicasInRemoving.add(replica.replicaId);
      }
    }

    // Count replicas in transition
    const transitioningReplicas = currentReplicas.filter((r) =>
      r.status === ReplicaStatus.CREATING ||
      r.status === ReplicaStatus.SYNCING ||
      r.status === ReplicaStatus.REMOVING);

    if (transitioningReplicas.length > NUM.ZERO) {
      this.logger.debug(REBALANCER_LOG_MSG.SKIP_TRANSITIONAL, {
        entityId: this.entityId,
        transitioningCount: transitioningReplicas.length,
      });
      return [];
    }

    const pendingCount = inFlightOperations.length;
    if (pendingCount > NUM.ZERO) {
      this.logger.debug(REBALANCER_LOG_MSG.SKIP_PENDING, {
        entityId: this.entityId,
        pendingCount,
      });
      return [];
    }

    // Count target replicas per node
    const targetCounts = new Map();
    for (const nodeId of targetNodeIds) {
      targetCounts.set(
        nodeId, (targetCounts.get(nodeId) || NUM.ZERO) + NUM.ONE,
      );
    }

    // Count current replicas per node
    const currentCounts = new Map();
    for (const replica of healthyReplicas) {
      if (replica && replica.node_id) {
        currentCounts.set(
          replica.node_id,
          (currentCounts.get(replica.node_id) || NUM.ZERO) + NUM.ONE,
        );
      }
    }

    // Handle failed/inactive replicas - always remove them
    for (const replica of currentReplicas) {
      const status = replica.status || ReplicaStatus.ACTIVE;
      const replicaId = replica.replica_id || replica.service_id;

      if (this.moveStateProvider.hasPendingMove(replicaId)) {
        continue;
      }
      if (replicasInRemoving.has(replicaId)) {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_REMOVE_REMOVING, {
          entityId: this.entityId,
          replicaId,
        });
        continue;
      }

      if (status === ReplicaStatus.FAILED) {
        moves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: replica.node_id,
          reason: 'replica_failed',
        });
      }
    }

    // Group healthy replicas by node for removal selection
    const replicasByNode = new Map();
    for (const replica of healthyReplicas) {
      if (replica && replica.node_id) {
        if (!replicasByNode.has(replica.node_id)) {
          replicasByNode.set(replica.node_id, []);
        }
        replicasByNode.get(replica.node_id).push(replica);
      }
    }

    // Generate ADD moves for under-represented nodes FIRST
    const addMoves = [];
    const replaceMoves = [];
    for (const [nodeId, targetCount] of targetCounts) {
      if (this.moveStateProvider.hasPendingAddForNode(nodeId)) {
        continue;
      }
      if (nodesWithAddTransitional.has(nodeId)) {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_ADD_TRANSITIONAL, {
          entityId: this.entityId,
          nodeId,
        });
        continue;
      }

      const currentCount = currentCounts.get(nodeId) || NUM.ZERO;
      const needed = targetCount - currentCount;

      for (let i = 0; i < needed; i++) {
        addMoves.push({
          type: MoveType.ADD,
          nodeId,
          reason: 'increase_replica_count',
        });
      }
    }

    const targetReplicaCount = targetState.targetReplicaCount;
    const shouldDeferAddsInDegraded = isDegradedPlacement &&
      healthyReplicas.length >= targetReplicaCount &&
      addMoves.length > NUM.ZERO;

    const totalHealthyAfterAdds =
      healthyReplicas.length + addMoves.length;
    const candidateRemoves = [];

    // Generate REMOVE moves for over-represented nodes
    for (const [nodeId, replicas] of replicasByNode) {
      const targetCount = targetCounts.get(nodeId) || NUM.ZERO;
      const currentCount = replicas.length;
      const excess = currentCount - targetCount;

      for (let i = 0; i < excess; i++) {
        const replicaToRemove = replicas[i];
        const replicaId =
          replicaToRemove.replica_id || replicaToRemove.service_id;

        if (this.moveStateProvider.hasPendingMove(replicaId)) {
          continue;
        }
        if (replicasInRemoving.has(replicaId)) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_REMOVE_REMOVING, {
            entityId: this.entityId,
            replicaId,
          });
          continue;
        }

        const reason = targetCount === NUM.ZERO ?
          'node_not_in_target' : 'spread_replicas';

        if (isDegradedPlacement && !shouldDeferAddsInDegraded) {
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
            entityId: this.entityId,
            replicaId,
            nodeId,
            reason,
            degraded: true,
            availableNodeCount:
              targetState.availableNodeCount || NUM.ZERO,
            targetReplicaCount,
          });
          continue;
        }

        if (reason === 'spread_replicas') {
          const existingRemoves = candidateRemoves.filter(
            (m) => m.reason === 'spread_replicas',
          ).length;

          if (totalHealthyAfterAdds - existingRemoves <=
              targetReplicaCount) {
            this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
              entityId: this.entityId,
              replicaId,
              nodeId,
              totalHealthyAfterAdds,
              existingRemoves,
              targetReplicaCount,
            });
            continue;
          }
        }

        candidateRemoves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: nodeId,
          reason,
        });
      }
    }

    const canUseDegradedReplace = isDegradedPlacement &&
      shouldDeferAddsInDegraded &&
      candidateRemoves.length > NUM.ZERO;

    if (shouldDeferAddsInDegraded && !canUseDegradedReplace) {
      this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
        entityId: this.entityId,
        healthyReplicaCount: healthyReplicas.length,
        targetReplicaCount,
        deferredAddCount: addMoves.length,
        availableNodeCount:
          targetState.availableNodeCount || NUM.ZERO,
      });
      addMoves.length = NUM.ZERO;
    }

    if (addMoves.length > NUM.ZERO &&
        candidateRemoves.length > NUM.ZERO &&
        (!isDegradedPlacement || canUseDegradedReplace)) {
      const replaceCandidates = candidateRemoves.filter((move) => {
        return move.reason === 'node_not_in_target' ||
          move.reason === 'spread_replicas';
      });
      const replaceCount =
        Math.min(addMoves.length, replaceCandidates.length);
      const consumedRemoveReplicaIds = new Set();

      for (let i = 0; i < replaceCount; i++) {
        const addMove = addMoves.shift();
        const removeMove = replaceCandidates[i];
        consumedRemoveReplicaIds.add(removeMove.replicaId);
        replaceMoves.push({
          type: MoveType.REPLACE,
          nodeId: addMove.nodeId,
          sourceNodeId: removeMove.nodeId,
          replicaId: removeMove.replicaId,
          reason: 'replace_replica',
        });
      }

      if (!isDegradedPlacement) {
        moves.push(...candidateRemoves.filter((move) => {
          return !consumedRemoveReplicaIds.has(move.replicaId);
        }));
      } else {
        const deferredAddCount = addMoves.length;
        if (deferredAddCount > NUM.ZERO) {
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
            entityId: this.entityId,
            healthyReplicaCount: healthyReplicas.length,
            targetReplicaCount,
            deferredAddCount,
            replaceMoveCount: replaceMoves.length,
            availableNodeCount:
              targetState.availableNodeCount || NUM.ZERO,
          });
        }
        addMoves.length = NUM.ZERO;
      }
    } else {
      moves.push(...candidateRemoves);
    }

    // Add the ADD moves to the moves array
    moves.push(...addMoves);

    // If there are ADD moves, only include critical REMOVE moves.
    if (addMoves.length > NUM.ZERO) {
      const criticalRemoves = moves.filter(
        (m) => m.type === MoveType.REMOVE &&
          (m.reason === 'replica_failed' ||
            (!isDegradedPlacement &&
              m.reason === 'node_not_in_target')),
      );
      const filteredMoves = [
        ...replaceMoves, ...addMoves, ...criticalRemoves,
      ];

      const deferredCount = moves.filter(
        (m) => m.type === MoveType.REMOVE &&
          m.reason !== 'replica_failed' &&
          m.reason !== 'node_not_in_target',
      ).length;

      if (criticalRemoves.length > NUM.ZERO ||
          deferredCount > NUM.ZERO) {
        this.logger.info(REBALANCER_LOG_MSG.INCLUDE_CRITICAL_REMOVE, {
          entityId: this.entityId,
          addMoveCount: addMoves.length,
          criticalRemoveCount: criticalRemoves.length,
          deferredRemoveCount: deferredCount,
        });
      }

      return filteredMoves;
    }

    // Include computed REPLACE and ADD moves.
    moves.push(...replaceMoves);
    moves.push(...addMoves);

    // Sort: failed REMOVE first, then REPLACE, then ADD, then REMOVE.
    moves.sort((a, b) => {
      const getPriority = (move) => {
        if (move.type === MoveType.REMOVE &&
            move.reason === 'replica_failed') {
          return NUM.ZERO;
        }
        if (move.type === MoveType.REPLACE) {
          return NUM.ONE;
        }
        if (move.type === MoveType.ADD) {
          return NUM.TWO;
        }
        return NUM.THREE;
      };
      return getPriority(a) - getPriority(b);
    });

    return moves;
  }

  /**
   * Apply pressure-state gating to a list of computed moves.
   *
   * For each storage-increasing move (ADD, REPLACE) targeting a node:
   * - hard/exhausted: skip non-critical moves
   * - soft: mark non-critical moves with `reducedPriority`
   * - normal: pass through unchanged
   *
   * Critical moves (replica_failed, under-replication) always pass.
   *
   * Requirements: 8.2, 8.3
   *
   * @param {Array<Object>} moves - Raw moves from calculateMoves.
   * @return {Promise<Array<Object>>} Filtered/annotated moves.
   */
  async applyPressureGating(moves) {
    if (!this.storagePressureBehavior || moves.length === NUM.ZERO) {
      return moves;
    }

    const result = [];

    for (const move of moves) {
      const targetNodeId = move.nodeId;

      // REMOVE moves are not storage-increasing — pass through
      if (move.type === MoveType.REMOVE) {
        result.push(move);
        continue;
      }

      const criticality = this.classifyMoveCriticality(move);
      const check = await this.storagePressureBehavior
        .shouldAllowMove(targetNodeId, criticality);

      if (check.decision === PRESSURE_BEHAVIOR_DECISION.DENY) {
        this.logger.info(
          STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, {
            entityId: this.entityId,
            nodeId: targetNodeId,
            moveType: move.type,
            reason: move.reason,
            pressureState: check.pressureState,
            criticality,
          });
        continue;
      }

      if (check.decision ===
          PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY) {
        result.push({...move, reducedPriority: true});
        continue;
      }

      result.push(move);
    }

    return result;
  }

  /**
   * Classify a move as critical or non-critical.
   *
   * Critical moves are correctness-preserving operations that must
   * proceed even under pressure (e.g. replacing a failed replica,
   * increasing replica count to meet minimum).
   *
   * @param {Object} move
   * @return {string} MOVE_CRITICALITY value
   * @private
   */
  classifyMoveCriticality(move) {
    if (move.reason === 'replica_failed' ||
        move.reason === 'increase_replica_count') {
      return MOVE_CRITICALITY.CRITICAL;
    }
    return MOVE_CRITICALITY.NON_CRITICAL;
  }
}

export {MovePlanner};
