/**
 * Move Planner - Calculates replica placement and moves for rebalancing.
 *
 * This module provides move planning logic extracted from UnifiedRebalancer.
 * It calculates target replica state and the moves needed to reach that
 * state for partitions, message groups, and runtime services.
 *
 * Requirements: 1.3, 1.8, 5.1, 5.2, 5.3, 5.4, 5.5, 11.3
 *
 * @module rebalancer/move-planner
 */

import { LoggingService } from '../logging/logging-service.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import {
  getPartitionRowFromCache,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
} from '../bootstrap/system-partition-classification.js';
import { NUM, WORKFLOW_STEP } from '../constants/index.js';
import { ADJUST_DIRECTION, ReplicaStatus } from './replica-status.js';
import { adjustToOddCount, getNextOddCount, getPreviousOddCount, isOddReplicaCount } from './odd-replica-count.js';
import { MOVE_REASON, PLACEMENT_DEGRADED_REASON, REBALANCER_ENTITY_TYPE, REBALANCER_LOG_MSG, REBALANCER_MOVE_TYPE, MOVE_PLANNER_ERROR_MSG, REBALANCER_SUBSYSTEM } from './rebalancer-constants.js';
import { ADMISSION_DECISION, MOVE_CRITICALITY, PRESSURE_BEHAVIOR_DECISION, STORAGE_CAPACITY_LOG_MSG } from './storage-capacity-constants.js';
import {createMovePlannerStateMethods} from './move-planner-state-methods.js';
const MOVE_PLANNER_LITERAL = Object.freeze({
  MOVEPLANNER_REQUIRES_ENTITYID: "MovePlanner requires entityId",
  MOVEPLANNER_REQUIRES_ENTITYTYPE: "MovePlanner requires entityType",
  MOVEPLANNER_REQUIRES_MOVESTATEPROVIDER: "MovePlanner requires moveStateProvider",
  FUNCTION: "function",
  STRING: "string",
  NODES_WITHOUT_LOCAL_REPLICA: "nodes_without_local_replica: ",
  EMPTY: ", ",
  CONTROL_PLANE_REPLICAS_NOT_SPREAD: "control_plane_replicas_not_spread: ",
  UNKNOWN: "unknown"
});
const EntityType = REBALANCER_ENTITY_TYPE;
const MoveType = REBALANCER_MOVE_TYPE;
const DegradedReason = PLACEMENT_DEGRADED_REASON;
const PLACEMENT_OCCUPIED_STATUSES = new Set([ReplicaStatus.PENDING, ReplicaStatus.CREATING, ReplicaStatus.SYNCING, ReplicaStatus.ACTIVE]);
const MOVE_PLANNER_TOPOLOGY_SCORE = Object.freeze({
  SAME_GROUP_BONUS: 5,
  SAME_GROUP_PENALTY: 2,
  DIVERSITY_NEW_GROUP_BONUS: 4,
  DIVERSITY_EXISTING_GROUP_PENALTY: 4
});
const CAPACITY_REJECTION_REASON = Object.freeze({
  ADMISSION_ERROR: 'admission_error'
});
const MOVE_PLANNER_REBALANCE_REASON = Object.freeze({
  REPLICA_COUNT_BELOW_TARGET: 'replica_count_below_target',
  REPLICA_COUNT_ABOVE_TARGET: 'replica_count_above_target',
  REPLICAS_NOT_SPREAD: 'replicas_not_spread',
  NODES_WITHOUT_LOCAL_REPLICA: 'nodes_without_local_replica'
});
const MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT = NUM.FIVE;
function buildReplicaCountPolicyDecision(options = {}) {
  const healthyReplicaCount = Number(options.healthyReplicaCount) || NUM.ZERO;
  const actionableTarget = Number(options.actionableTarget) || NUM.ZERO;
  const targetCount = Number(options.targetCount) || NUM.ZERO;
  let needsRebalancing = false;
  let reason = null;
  if (healthyReplicaCount < actionableTarget) {
    needsRebalancing = true;
    reason = MOVE_PLANNER_REBALANCE_REASON.REPLICA_COUNT_BELOW_TARGET;
  } else if (healthyReplicaCount > targetCount) {
    needsRebalancing = true;
    reason = MOVE_PLANNER_REBALANCE_REASON.REPLICA_COUNT_ABOVE_TARGET;
  }
  return {
    needsRebalancing,
    reason
  };
}
function applyAdditionalRebalancingReason(decision, shouldRebalance, reason) {
  if (!shouldRebalance) {
    return decision;
  }
  return {
    ...decision,
    needsRebalancing: true,
    reason: decision.reason || reason
  };
}
function buildMessageGroupPlacementResult(options = {}) {
  const targetReplicaCount = Number(options.targetReplicaCount) || NUM.ZERO;
  const targetNodes = Array.isArray(options.targetNodes) ? options.targetNodes : [];
  return {
    targetReplicaCount,
    targetNodes,
    maxReplicaCount: options.maxReplicaCount || MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT,
    degraded: targetNodes.length < targetReplicaCount,
    degradedReason: options.degradedReason,
    availableNodeCount: Number(options.availableNodeCount) || NUM.ZERO,
    capacityDiagnostics: options.capacityDiagnostics
  };
}

const MOVE_PLANNER_STATE_METHODS = createMovePlannerStateMethods({
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
  buildReplicaCountPolicyDecision,
  getNextOddCount,
  getPartitionRowFromCache,
  getPreviousOddCount,
  isOddReplicaCount,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
});

/**
 * MovePlanner calculates replica placement and moves for partitions,
 * message groups, and runtime services.
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
 * @param {string} options.entityId - Entity ID (partition, message
 *   group, or service definition ID)
 * @param {string} options.entityType - 'partition', 'message_group',
 *   or 'runtime_service'
 * @param {Object} options.moveStateProvider - Provider for state access
 * @param {Object} [options.storageAdmissionService] - Admission gate
 * @param {Object} [options.accountingService] - Capacity accounting
 * @param {Object} [options.storagePressureBehavior] - Pressure behavior
 */
class MovePlanner {
  /**
   * Create a new MovePlanner instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.entityId - Entity ID (partition, message
   *   group, or service definition ID).
   * @param {string} options.entityType - 'partition', 'message_group',
   *   or 'runtime_service'.
   * @param {Object} options.moveStateProvider - Provider for state access.
   * @param {Object} [options.storageAdmissionService] - Admission gate.
   * @param {Object} [options.accountingService] - Capacity accounting.
   * @param {Object} [options.storagePressureBehavior] - Pressure behavior.
   */
  constructor(options = {}) {
    if (!options.entityId) {
      throw new Error(MOVE_PLANNER_LITERAL.MOVEPLANNER_REQUIRES_ENTITYID);
    }
    if (!options.entityType) {
      throw new Error(MOVE_PLANNER_LITERAL.MOVEPLANNER_REQUIRES_ENTITYTYPE);
    }
    if (!options.moveStateProvider) {
      throw new Error(MOVE_PLANNER_LITERAL.MOVEPLANNER_REQUIRES_MOVESTATEPROVIDER);
    }
    this.entityId = options.entityId;
    this.entityType = options.entityType;
    this.moveStateProvider = options.moveStateProvider;
    this.storageAdmissionService = options.storageAdmissionService || null;
    this.accountingService = options.accountingService || null;
    this.storagePressureBehavior = options.storagePressureBehavior || null;
    this.strictOwnerDependencies = options.strictOwnerDependencies === true;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED) : console;
  }

  /**
   * Calculate target state based on policy.
   * Applies capacity feasibility filter before scoring when admission
   * service is available.
   *
   * Routes entity types to the appropriate placement strategy:
   * - MESSAGE_GROUP with ensureLocalAccess: message-group placement
   * - PARTITION: partition placement (spread by suitability)
   * - RUNTIME_SERVICE: partition placement (cluster-global target)
   *
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @return {Promise<Object>} Target state with replica count and
   *   placement.
   */
  async calculateTargetState(currentReplicas, policy) {
    const nodes = this.moveStateProvider.getAvailableNodes();
    const targetReplicaCount = policy.targetReplicaCount || policy.replicaCount || NUM.THREE;
    const estimatedBytes = this.getEstimatedBytesForEntity();
    const transitionSnapshot = this.buildTopologyTransitionSnapshot();
    const {
      feasibleNodes,
      diagnostics
    } = await this.filterNodesByCapacity(nodes, estimatedBytes);

    // For message groups: ensure every node has local access
    if (this.entityType === EntityType.MESSAGE_GROUP && policy.ensureLocalAccess) {
      return this.calculateMessageGroupPlacement(
        feasibleNodes,
        targetReplicaCount,
        policy,
        diagnostics,
        transitionSnapshot,
      );
    }

    // For partitions and runtime services: spread across nodes by
    // policy with cluster-global replica count target.
    return this.calculatePartitionPlacement(
      feasibleNodes,
      targetReplicaCount,
      policy,
      diagnostics,
      transitionSnapshot,
    );
  }

  /**
   * Estimate bytes needed for a replica of this entity type.
   * Delegates to accountingService when available.
   * @return {number} estimated bytes or 0 when unavailable
   * @private
   */
  getEstimatedBytesForEntity() {
    if (!this.accountingService || typeof this.accountingService.estimateReplicaBytes !== MOVE_PLANNER_LITERAL.FUNCTION) {
      if (this.strictOwnerDependencies) {
        throw new Error(!this.accountingService ? MOVE_PLANNER_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED : MOVE_PLANNER_ERROR_MSG.STORAGE_ACCOUNTING_ESTIMATE_REQUIRED);
      }
      return NUM.ZERO;
    }
    return this.accountingService.estimateReplicaBytes({
      entityType: this.entityType,
      sizeBytes: NUM.ZERO
    });
  }

  /**
   * Filter nodes by storage capacity feasibility.
   *
   * When storageAdmissionService is available, each candidate node is
   * checked via checkAdd. Nodes that fail admission are excluded from
   * placement.
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
      capacityFilterApplied: false
    };
    if (estimatedBytes <= NUM.ZERO) {
      diagnostics.feasibleCount = nodes.length;
      return {
        feasibleNodes: nodes,
        diagnostics
      };
    }
    if (!this.storageAdmissionService || typeof this.storageAdmissionService.checkAdd !== MOVE_PLANNER_LITERAL.FUNCTION) {
      if (this.strictOwnerDependencies) {
        throw new Error(!this.storageAdmissionService ? MOVE_PLANNER_ERROR_MSG.STORAGE_ADMISSION_REQUIRED : MOVE_PLANNER_ERROR_MSG.STORAGE_ADMISSION_CHECK_ADD_REQUIRED);
      }
      diagnostics.feasibleCount = nodes.length;
      return {
        feasibleNodes: nodes,
        diagnostics
      };
    }
    diagnostics.capacityFilterApplied = true;
    const feasibleNodes = [];
    const criticalAdmissionEntity = this.isCriticalAdmissionEntity();
    for (const node of nodes) {
      const nodeId = node.node_id;
      try {
        const result = await this.storageAdmissionService.checkAdd({
          targetNodeId: nodeId,
          estimatedBytes,
          isCritical: criticalAdmissionEntity
        });
        if (result.decision === ADMISSION_DECISION.ALLOW) {
          feasibleNodes.push(node);
        } else {
          const reason = result.reason;
          diagnostics.rejectionsByReason[reason] = (diagnostics.rejectionsByReason[reason] || NUM.ZERO) + NUM.ONE;
          this.logger.debug(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, {
            entityId: this.entityId,
            nodeId,
            reason,
            projectedUtilization: result.projectedUtilization
          });
        }
      } catch (err) {
        diagnostics.rejectionsByReason[CAPACITY_REJECTION_REASON.ADMISSION_ERROR] = (diagnostics.rejectionsByReason[CAPACITY_REJECTION_REASON.ADMISSION_ERROR] || NUM.ZERO) + NUM.ONE;
        this.logger.warn(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, {
          entityId: this.entityId,
          nodeId,
          reason: CAPACITY_REJECTION_REASON.ADMISSION_ERROR,
          error: err?.message || null
        });
      }
    }
    diagnostics.feasibleCount = feasibleNodes.length;
    diagnostics.rejectedCount = nodes.length - feasibleNodes.length;
    if (diagnostics.rejectedCount > NUM.ZERO) {
      this.logger.info(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_APPLIED, {
        entityId: this.entityId,
        entityType: this.entityType,
        totalCandidates: diagnostics.totalCandidates,
        feasibleCount: diagnostics.feasibleCount,
        rejectedCount: diagnostics.rejectedCount,
        rejectionsByReason: diagnostics.rejectionsByReason
      });
    }
    return {
      feasibleNodes,
      diagnostics
    };
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
  getDegradedReason(totalReadyNodes, feasibleCount, effectiveCount, targetCount, diagnostics) {
    if (effectiveCount >= targetCount) {
      return null;
    }
    // Capacity filtering removed nodes — capacity is the bottleneck
    // when the filter reduced the candidate set below target.
    if (diagnostics.rejectedCount > NUM.ZERO && feasibleCount < targetCount) {
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
    nodes,
    targetCount,
    policy,
    diagnostics,
    transitionSnapshot = null,
  ) {
    const targetNodes = [];
    const diag = diagnostics || {
      totalCandidates: nodes ? nodes.length : NUM.ZERO,
      feasibleCount: nodes ? nodes.length : NUM.ZERO,
      rejectedCount: NUM.ZERO,
      rejectionsByReason: {},
      capacityFilterApplied: false
    };
    const totalReadyNodes = diag.totalCandidates;
    const maxReplicaCount = policy.maxReplicaCount || MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT;

    // No feasible nodes: we cannot place any replicas.
    if (!nodes || nodes.length === NUM.ZERO) {
      return buildMessageGroupPlacementResult({
        targetReplicaCount: targetCount,
        targetNodes: [],
        maxReplicaCount,
        degradedReason: this.getDegradedReason(totalReadyNodes, NUM.ZERO, NUM.ZERO, targetCount, diag),
        availableNodeCount: NUM.ZERO,
        capacityDiagnostics: diag
      });
    }

    // First, ensure we have replicas spread across nodes
    if (policy.placementConstraints?.spreadAcrossNodes) {
      // Sort nodes by current replica load (prefer less loaded nodes)
      const sortedNodes = this.sortNodesByLoad(nodes);
      if (sortedNodes.length === NUM.ZERO) {
        return buildMessageGroupPlacementResult({
          targetReplicaCount: targetCount,
          targetNodes: [],
          maxReplicaCount,
          degradedReason: this.getDegradedReason(totalReadyNodes, NUM.ZERO, NUM.ZERO, targetCount, diag),
          availableNodeCount: NUM.ZERO,
          capacityDiagnostics: diag
        });
      }
      const effectiveCount = Math.min(targetCount, sortedNodes.length);
      const reservedTargetNodeIds = this.resolveReservedPlacementTargetNodeIds(
        sortedNodes,
        transitionSnapshot,
        effectiveCount,
      );
      targetNodes.push(
        ...this.resolvePlacementTargetNodeIds(sortedNodes, {
          targetCount: effectiveCount,
          reservedNodeIds: reservedTargetNodeIds,
        }),
      );
      return buildMessageGroupPlacementResult({
        targetReplicaCount: targetCount,
        targetNodes,
        maxReplicaCount,
        degradedReason: this.getDegradedReason(totalReadyNodes, sortedNodes.length, effectiveCount, targetCount, diag),
        availableNodeCount: sortedNodes.length,
        capacityDiagnostics: diag
      });
    }
    return buildMessageGroupPlacementResult({
      targetReplicaCount: targetCount,
      targetNodes,
      maxReplicaCount,
      degradedReason: this.getDegradedReason(totalReadyNodes, nodes.length, targetNodes.length, targetCount, diag),
      availableNodeCount: nodes.length,
      capacityDiagnostics: diag
    });
  }

  /**
   * Calculate optimal placement for partitions.
   * @param {Array<Object>} nodes - Feasible nodes after capacity filter.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Table policy.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {Object} Target placement state.
   */
  calculatePartitionPlacement(
    nodes,
    targetCount,
    policy,
    diagnostics,
    transitionSnapshot = null,
  ) {
    const targetNodes = [];
    const diag = diagnostics || {
      totalCandidates: nodes ? nodes.length : NUM.ZERO,
      feasibleCount: nodes ? nodes.length : NUM.ZERO,
      rejectedCount: NUM.ZERO,
      rejectionsByReason: {},
      capacityFilterApplied: false
    };
    const totalReadyNodes = diag.totalCandidates;

    // Sort nodes by suitability based on policy constraints
    const sortedNodes = this.sortNodesBySuitability(nodes, policy);

    // No feasible nodes: we cannot place any replicas.
    if (sortedNodes.length === NUM.ZERO) {
      const degradedReason = this.getDegradedReason(totalReadyNodes, NUM.ZERO, NUM.ZERO, targetCount, diag);
      const prioritySpread = this.analyzePrioritySpread([], policy, []);
      return {
        targetReplicaCount: targetCount,
        targetNodes: [],
        minReplicaCount: policy.minReplicaCount || NUM.THREE,
        maxReplicaCount: policy.maxReplicaCount || NUM.SEVEN,
        degraded: true,
        degradedReason,
        availableNodeCount: NUM.ZERO,
        capacityDiagnostics: diag,
        prioritySpread
      };
    }

    // Keep desired replica target independent of current node count.
    // Placement assigns at most one replica per available node.
    const effectiveCount = Math.min(targetCount, sortedNodes.length);
    const reservedTargetNodeIds = this.resolveReservedPlacementTargetNodeIds(
      sortedNodes,
      transitionSnapshot,
      effectiveCount,
    );
    const deferredTargetNodeIds = this.isSystemPartitionEntity() ?
      this.resolveDeferredPlacementTargetNodeIds(
        sortedNodes,
        transitionSnapshot,
        reservedTargetNodeIds,
      ) :
      [];
    targetNodes.push(
      ...this.resolvePlacementTargetNodeIds(sortedNodes, {
        targetCount: effectiveCount,
        reservedNodeIds: reservedTargetNodeIds,
        deferredNodeIds: deferredTargetNodeIds,
      }),
    );
    const degradedReason = this.getDegradedReason(totalReadyNodes, sortedNodes.length, effectiveCount, targetCount, diag);
    const prioritySpread = this.analyzePrioritySpread(targetNodes.map(nodeId => ({
      node_id: nodeId,
      status: ReplicaStatus.ACTIVE
    })), policy, sortedNodes);
    return {
      targetReplicaCount: targetCount,
      targetNodes,
      minReplicaCount: policy.minReplicaCount || NUM.THREE,
      maxReplicaCount: policy.maxReplicaCount || NUM.SEVEN,
      degraded: effectiveCount < targetCount,
      degradedReason,
      availableNodeCount: sortedNodes.length,
      capacityDiagnostics: diag,
      prioritySpread
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
        scoreA += this.getLatencyGroupDiversityScoreAdjustment(a, topologyContext);
        scoreB += this.getLatencyGroupDiversityScoreAdjustment(b, topologyContext);
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
   * Keep transitional add targets inside the canonical placement target set
   * while bootstrap/replacement work is still in flight. Without this,
   * recalculating target nodes from live suitability alone can retarget a
   * still-bootstrapping replica to a second node and mint an extra ADD.
   *
   * @param {Array<Object>} sortedNodes
   * @param {Object|null} transitionSnapshot
   * @param {number} targetCount
   * @return {string[]}
   * @private
   */
  resolveReservedPlacementTargetNodeIds(
    sortedNodes,
    transitionSnapshot,
    targetCount,
  ) {
    const normalizedTargetCount =
      Number.isInteger(targetCount) && targetCount > NUM.ZERO ?
        targetCount :
        NUM.ZERO;
    if (!Array.isArray(sortedNodes) ||
        sortedNodes.length === NUM.ZERO ||
        normalizedTargetCount === NUM.ZERO) {
      return [];
    }

    const rankedNodeIds = sortedNodes
      .map((node) => node?.node_id)
      .filter((nodeId) => typeof nodeId === MOVE_PLANNER_LITERAL.STRING &&
        nodeId.length > NUM.ZERO);
    if (rankedNodeIds.length === NUM.ZERO) {
      return [];
    }

    const transitionalNodeIds =
      transitionSnapshot?.nodesWithEntityAddTransitional instanceof Set ?
        transitionSnapshot.nodesWithEntityAddTransitional :
        new Set();
    return rankedNodeIds
      .filter((nodeId) => transitionalNodeIds.has(nodeId))
      .slice(NUM.ZERO, normalizedTargetCount);
  }

  /**
   * Deprioritize cluster-global transitional system-add targets during
   * canonical placement selection so system partitions can still choose
   * alternative eligible nodes before move emission blocks the occupied
   * target later in the pipeline.
   *
   * Reserved same-entity transitional targets are excluded from this deferred
   * set because they must remain stable while the owning workflow converges.
   *
   * @param {Array<Object>} sortedNodes
   * @param {Object|null} transitionSnapshot
   * @param {string[]} [reservedNodeIds=[]]
   * @return {string[]}
   * @private
   */
  resolveDeferredPlacementTargetNodeIds(
    sortedNodes,
    transitionSnapshot,
    reservedNodeIds = [],
  ) {
    if (!Array.isArray(sortedNodes) || sortedNodes.length === NUM.ZERO) {
      return [];
    }

    const rankedNodeIds = sortedNodes
      .map((node) => node?.node_id)
      .filter((nodeId) => typeof nodeId === MOVE_PLANNER_LITERAL.STRING &&
        nodeId.length > NUM.ZERO);
    if (rankedNodeIds.length === NUM.ZERO) {
      return [];
    }

    const reservedNodeIdSet = new Set(
      (Array.isArray(reservedNodeIds) ? reservedNodeIds : [])
        .filter((nodeId) => typeof nodeId === MOVE_PLANNER_LITERAL.STRING &&
          nodeId.length > NUM.ZERO),
    );
    const deferredNodeIdSet =
      transitionSnapshot?.nodesWithGlobalSystemAddTransitional instanceof Set ?
        transitionSnapshot.nodesWithGlobalSystemAddTransitional :
        new Set();
    return rankedNodeIds.filter((nodeId) =>
      deferredNodeIdSet.has(nodeId) &&
      !reservedNodeIdSet.has(nodeId),
    );
  }

  /**
   * Select one canonical target cohort from ranked placement candidates while
   * preserving any reserved transitional nodes in the final target set.
   *
   * @param {Array<Object>} sortedNodes
   * @param {Object} [options={}]
   * @param {number} [options.targetCount]
   * @param {string[]} [options.reservedNodeIds]
   * @param {string[]} [options.deferredNodeIds]
   * @return {string[]}
   * @private
   */
  resolvePlacementTargetNodeIds(sortedNodes, options = {}) {
    const normalizedTargetCount =
      Number.isInteger(options?.targetCount) && options.targetCount > NUM.ZERO ?
        options.targetCount :
        NUM.ZERO;
    if (!Array.isArray(sortedNodes) ||
        sortedNodes.length === NUM.ZERO ||
        normalizedTargetCount === NUM.ZERO) {
      return [];
    }

    const rankedNodeIds = sortedNodes
      .map((node) => node?.node_id)
      .filter((nodeId) => typeof nodeId === MOVE_PLANNER_LITERAL.STRING &&
        nodeId.length > NUM.ZERO);
    if (rankedNodeIds.length === NUM.ZERO) {
      return [];
    }

    const reservedNodeIdSet = new Set(
      (Array.isArray(options?.reservedNodeIds) ?
        options.reservedNodeIds :
        [])
        .filter((nodeId) => typeof nodeId === MOVE_PLANNER_LITERAL.STRING &&
          nodeId.length > NUM.ZERO),
    );
    const reservedNodeIds = rankedNodeIds
      .filter((nodeId) => reservedNodeIdSet.has(nodeId))
      .slice(NUM.ZERO, normalizedTargetCount);
    const deferredNodeIdSet = new Set(
      (Array.isArray(options?.deferredNodeIds) ?
        options.deferredNodeIds :
        [])
        .filter((nodeId) => typeof nodeId === MOVE_PLANNER_LITERAL.STRING &&
          nodeId.length > NUM.ZERO),
    );
    const deferredNodeIds = rankedNodeIds
      .filter((nodeId) =>
        deferredNodeIdSet.has(nodeId) &&
        !reservedNodeIdSet.has(nodeId),
      )
      .slice(NUM.ZERO, normalizedTargetCount);
    const selectedNodeIds = [...reservedNodeIds];

    for (const nodeId of rankedNodeIds) {
      if (selectedNodeIds.length >= normalizedTargetCount) {
        break;
      }
      if (reservedNodeIdSet.has(nodeId)) {
        continue;
      }
      if (deferredNodeIdSet.has(nodeId)) {
        continue;
      }
      selectedNodeIds.push(nodeId);
    }

    for (const nodeId of deferredNodeIds) {
      if (selectedNodeIds.length >= normalizedTargetCount) {
        break;
      }
      selectedNodeIds.push(nodeId);
    }

    const selectedNodeIdSet = new Set(selectedNodeIds);
    return rankedNodeIds
      .filter((nodeId) => selectedNodeIdSet.has(nodeId))
      .slice(NUM.ZERO, normalizedTargetCount);
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
    const currentReplicas = typeof this.moveStateProvider.getCurrentReplicas === 'function' ? this.moveStateProvider.getCurrentReplicas() : [];
    const healthyReplicas = typeof this.moveStateProvider.getHealthyReplicas === 'function' ? this.moveStateProvider.getHealthyReplicas(currentReplicas) : currentReplicas;
    const existingGroupCounts = new Map();
    for (const replica of healthyReplicas) {
      const nodeId = replica?.node_id;
      const groupId = nodeGroupById.get(nodeId) || null;
      if (!groupId) {
        continue;
      }
      existingGroupCounts.set(groupId, (existingGroupCounts.get(groupId) || NUM.ZERO) + NUM.ONE);
    }
    return {
      nodeGroupById,
      existingGroupCounts,
      dominantGroupId: this.selectDominantGroupId(existingGroupCounts)
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
      if (count === dominantCount && dominantGroupId && groupId < dominantGroupId) {
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
    const healthyReplicas = this.moveStateProvider.getHealthyReplicas(currentReplicas);
    const isTopologyCleanupReason = reason => {
      return reason === MOVE_REASON.NODE_NOT_IN_TARGET || reason === MOVE_REASON.SPREAD_REPLICAS;
    };
    const prioritySpreadPolicy = {
      placementConstraints: {
        spreadAcrossNodes: true
      }
    };
    const placementReplicas = currentReplicas.filter(replica => {
      const status = typeof replica?.status === 'string' ? replica.status.toLowerCase() : ReplicaStatus.ACTIVE;
      return !!replica?.node_id && PLACEMENT_OCCUPIED_STATUSES.has(status);
    });
    const activePlacementReplicas = currentReplicas.filter(replica => {
      const status = replica?.status || ReplicaStatus.ACTIVE;
      return status === ReplicaStatus.ACTIVE && !!replica?.node_id;
    });
    const targetNodeIds = targetState.targetNodes;
    const isDegradedPlacement = !!targetState?.degraded;
    const transitionSnapshot = this.buildTopologyTransitionSnapshot();
    const nodesWithAddTransitional =
      transitionSnapshot.nodesWithEntityAddTransitional;
    const nodesWithGlobalSystemAddTransitional =
      transitionSnapshot.nodesWithGlobalSystemAddTransitional;
    const replicasInRemoving = transitionSnapshot.replicasInRemoving;
    const pendingCount = transitionSnapshot.pendingCount;
    if (pendingCount > NUM.ZERO) {
      // Operation lifecycle is owned by replica_operations. Service-row status
      // can be stale (for example bootstrap-local syncing followers), so we only
      // treat in-flight operations as authoritative transitional state for
      // topology-increasing work. Cleanup-only removals may still proceed when
      // the entity is already above target.
      if (!this.isControlPlanePriorityPartition()) {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_PENDING, {
          entityId: this.entityId,
          pendingCount,
          cleanupOnly: true
        });
      } else {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_PENDING, {
          entityId: this.entityId,
          pendingCount,
          bypassedForPriorityRecovery: true
        });
      }
    }
    const cleanupOnlyWhilePending = pendingCount > NUM.ZERO && !this.isControlPlanePriorityPartition();

    // Count target replicas per node
    const targetCounts = new Map();
    for (const nodeId of targetNodeIds) {
      targetCounts.set(nodeId, (targetCounts.get(nodeId) || NUM.ZERO) + NUM.ONE);
    }

    // Count current replicas per node
    const currentCounts = new Map();
    for (const replica of placementReplicas) {
      if (replica && replica.node_id) {
        currentCounts.set(replica.node_id, (currentCounts.get(replica.node_id) || NUM.ZERO) + NUM.ONE);
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
          replicaId
        });
        continue;
      }
      if (status === ReplicaStatus.FAILED) {
        moves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: replica.node_id,
          reason: MOVE_REASON.REPLICA_FAILED
        });
      }
    }

    // Group active placement replicas by node for removal selection
    const replicasByNode = new Map();
    for (const replica of activePlacementReplicas) {
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
    if (!cleanupOnlyWhilePending) {
      for (const [nodeId, targetCount] of targetCounts) {
        if (this.moveStateProvider.hasPendingAddForNode(nodeId)) {
          continue;
        }
        if (nodesWithAddTransitional.has(nodeId)) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_ADD_TRANSITIONAL, {
            entityId: this.entityId,
            nodeId
          });
          continue;
        }
        if (nodesWithGlobalSystemAddTransitional.has(nodeId)) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_ADD_TRANSITIONAL, {
            entityId: this.entityId,
            nodeId,
            globalSystemTargetOccupancy: true,
          });
          continue;
        }
        const currentCount = currentCounts.get(nodeId) || NUM.ZERO;
        const needed = targetCount - currentCount;
        for (let i = NUM.ZERO; i < needed; i++) {
          addMoves.push({
            type: MoveType.ADD,
            nodeId,
            reason: MOVE_REASON.INCREASE_REPLICA_COUNT
          });
        }
      }
    }
    const targetReplicaCount = targetState.targetReplicaCount;
    const shouldDeferAddsInDegraded = isDegradedPlacement && activePlacementReplicas.length >= targetReplicaCount && addMoves.length > NUM.ZERO;
    const totalHealthyAfterAdds = activePlacementReplicas.length + addMoves.length;
    const candidateRemoves = [];

    // Generate REMOVE moves for over-represented nodes
    for (const [nodeId, replicas] of replicasByNode) {
      const targetCount = targetCounts.get(nodeId) || NUM.ZERO;
      const currentCount = replicas.length;
      const excess = currentCount - targetCount;
      for (let i = NUM.ZERO; i < excess; i++) {
        const replicaToRemove = replicas[i];
        const replicaId = replicaToRemove.replica_id || replicaToRemove.service_id;
        if (this.moveStateProvider.hasPendingMove(replicaId)) {
          continue;
        }
        if (replicasInRemoving.has(replicaId)) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_REMOVE_REMOVING, {
            entityId: this.entityId,
            replicaId
          });
          continue;
        }
        const reason = targetCount === NUM.ZERO ? MOVE_REASON.NODE_NOT_IN_TARGET : MOVE_REASON.SPREAD_REPLICAS;
        if (cleanupOnlyWhilePending && isTopologyCleanupReason(reason)) {
          const existingCleanupRemoves = candidateRemoves.filter(move => isTopologyCleanupReason(move.reason)).length;
          if (activePlacementReplicas.length - existingCleanupRemoves <= targetReplicaCount) {
            this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
              entityId: this.entityId,
              replicaId,
              nodeId,
              reason,
              cleanupOnlyWhilePending: true,
              activePlacementReplicaCount: activePlacementReplicas.length,
              existingCleanupRemoves,
              targetReplicaCount
            });
            continue;
          }
        }
        if (isDegradedPlacement && !shouldDeferAddsInDegraded) {
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
            entityId: this.entityId,
            replicaId,
            nodeId,
            reason,
            degraded: true,
            availableNodeCount: targetState.availableNodeCount || NUM.ZERO,
            targetReplicaCount
          });
          continue;
        }
        if (addMoves.length === NUM.ZERO && this.isControlPlanePriorityPartition() && (reason === MOVE_REASON.NODE_NOT_IN_TARGET || reason === MOVE_REASON.SPREAD_REPLICAS)) {
          const remainingActiveReplicas = activePlacementReplicas.filter(candidate => {
            const candidateReplicaId = candidate?.replica_id || candidate?.service_id;
            return candidateReplicaId !== replicaId;
          });
          const prioritySpreadAfterRemove = this.analyzePrioritySpread(remainingActiveReplicas, prioritySpreadPolicy, this.moveStateProvider.getAvailableNodes());
          if (prioritySpreadAfterRemove.requiresSpread === true && prioritySpreadAfterRemove.satisfied !== true) {
            this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
              entityId: this.entityId,
              replicaId,
              nodeId,
              reason,
              requiredDistinctNodeCount: prioritySpreadAfterRemove.requiredDistinctNodeCount,
              remainingDistinctNodeCount: prioritySpreadAfterRemove.actualDistinctNodeCount
            });
            continue;
          }
        }
        if (reason === MOVE_REASON.SPREAD_REPLICAS) {
          const existingRemoves = candidateRemoves.filter(m => m.reason === MOVE_REASON.SPREAD_REPLICAS).length;
          if (totalHealthyAfterAdds - existingRemoves <= targetReplicaCount) {
            this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
              entityId: this.entityId,
              replicaId,
              nodeId,
              totalHealthyAfterAdds,
              existingRemoves,
              targetReplicaCount
            });
            continue;
          }
        }
        candidateRemoves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: nodeId,
          reason,
          standaloneSafe: activePlacementReplicas.length - candidateRemoves.length > targetReplicaCount
        });
      }
    }
    const canUseDegradedReplace = isDegradedPlacement && shouldDeferAddsInDegraded && candidateRemoves.length > NUM.ZERO;
    if (shouldDeferAddsInDegraded && !canUseDegradedReplace) {
      this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
        entityId: this.entityId,
        healthyReplicaCount: healthyReplicas.length,
        activePlacementReplicaCount: activePlacementReplicas.length,
        targetReplicaCount,
        deferredAddCount: addMoves.length,
        availableNodeCount: targetState.availableNodeCount || NUM.ZERO
      });
      addMoves.length = NUM.ZERO;
    }
    if (addMoves.length > NUM.ZERO && candidateRemoves.length > NUM.ZERO && (!isDegradedPlacement || canUseDegradedReplace)) {
      const replaceCandidates = candidateRemoves.filter(move => {
        return move.reason === MOVE_REASON.NODE_NOT_IN_TARGET || move.reason === MOVE_REASON.SPREAD_REPLICAS;
      });
      const replaceCount = Math.min(addMoves.length, replaceCandidates.length);
      const consumedRemoveReplicaIds = new Set();
      for (let i = NUM.ZERO; i < replaceCount; i++) {
        const addMove = addMoves.shift();
        const removeMove = replaceCandidates[i];
        consumedRemoveReplicaIds.add(removeMove.replicaId);
        replaceMoves.push({
          type: MoveType.REPLACE,
          nodeId: addMove.nodeId,
          sourceNodeId: removeMove.nodeId,
          replicaId: removeMove.replicaId,
          reason: MOVE_REASON.REPLACE_REPLICA
        });
      }
      if (!isDegradedPlacement) {
        moves.push(...candidateRemoves.filter(move => {
          return !consumedRemoveReplicaIds.has(move.replicaId);
        }));
      } else {
        const deferredAddCount = addMoves.length;
        if (deferredAddCount > NUM.ZERO) {
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
            entityId: this.entityId,
            healthyReplicaCount: healthyReplicas.length,
            activePlacementReplicaCount: activePlacementReplicas.length,
            targetReplicaCount,
            deferredAddCount,
            replaceMoveCount: replaceMoves.length,
            availableNodeCount: targetState.availableNodeCount || NUM.ZERO
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
      const criticalRemoves = moves.filter(m => m.type === MoveType.REMOVE && (m.reason === MOVE_REASON.REPLICA_FAILED || !isDegradedPlacement && m.reason === MOVE_REASON.NODE_NOT_IN_TARGET));
      const filteredMoves = [...replaceMoves, ...addMoves, ...criticalRemoves];
      const deferredCount = moves.filter(m => m.type === MoveType.REMOVE && m.reason !== MOVE_REASON.REPLICA_FAILED && m.reason !== MOVE_REASON.NODE_NOT_IN_TARGET).length;
      if (criticalRemoves.length > NUM.ZERO || deferredCount > NUM.ZERO) {
        this.logger.info(REBALANCER_LOG_MSG.INCLUDE_CRITICAL_REMOVE, {
          entityId: this.entityId,
          addMoveCount: addMoves.length,
          criticalRemoveCount: criticalRemoves.length,
          deferredRemoveCount: deferredCount
        });
      }
      return filteredMoves;
    }

    // Include computed REPLACE and ADD moves.
    moves.push(...replaceMoves);
    moves.push(...addMoves);

    // Sort: failed REMOVE first, then REPLACE, then ADD, then REMOVE.
    moves.sort((a, b) => {
      const getPriority = move => {
        if (move.type === MoveType.REMOVE && move.reason === MOVE_REASON.REPLICA_FAILED) {
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
    if (moves.length === NUM.ZERO) {
      return moves;
    }
    if (!this.storagePressureBehavior || typeof this.storagePressureBehavior.shouldAllowMove !== MOVE_PLANNER_LITERAL.FUNCTION) {
      if (this.strictOwnerDependencies) {
        throw new Error(!this.storagePressureBehavior ? MOVE_PLANNER_ERROR_MSG.STORAGE_PRESSURE_BEHAVIOR_REQUIRED : MOVE_PLANNER_ERROR_MSG.STORAGE_PRESSURE_BEHAVIOR_CHECK_REQUIRED);
      }
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
      const check = await this.storagePressureBehavior.shouldAllowMove(targetNodeId, criticality);
      if (check.decision === PRESSURE_BEHAVIOR_DECISION.DENY) {
        this.logger.info(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, {
          entityId: this.entityId,
          nodeId: targetNodeId,
          moveType: move.type,
          reason: move.reason,
          pressureState: check.pressureState,
          criticality
        });
        continue;
      }
      if (check.decision === PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY) {
        result.push({
          ...move,
          reducedPriority: true
        });
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
    if (move.reason === MOVE_REASON.REPLICA_FAILED || move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT) {
      return MOVE_CRITICALITY.CRITICAL;
    }
    if (this.isControlPlanePriorityPartition() && (move.reason === MOVE_REASON.SPREAD_REPLICAS || move.reason === MOVE_REASON.REPLACE_REPLICA)) {
      return MOVE_CRITICALITY.CRITICAL;
    }
    return MOVE_CRITICALITY.NON_CRITICAL;
  }
}

Object.assign(MovePlanner.prototype, MOVE_PLANNER_STATE_METHODS);

export { MovePlanner };
